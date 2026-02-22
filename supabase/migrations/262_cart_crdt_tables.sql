-- Migration 262: Shopping Cart CRDT System Implementation
-- ============================================================
-- Purpose: Implement Causal-Stable Shopping Cart (CSSC) with CRDT semantics
-- Features: Intent-based synchronization, mobile-first design, cross-device consistency
-- ============================================================

-- ============================================================
-- Step 1: Create cart_epochs table (Epoch management)
-- ============================================================

CREATE TABLE IF NOT EXISTS cart_epochs (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_epoch INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_cart_epochs_user ON cart_epochs(user_id);

-- ============================================================
-- Step 2: Create cart_sessions table (Session management)
-- ============================================================

CREATE TABLE IF NOT EXISTS cart_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Session type
  session_type TEXT NOT NULL CHECK (session_type IN ('auth', 'anonymous')),
  
  -- Anonymous token (for anonymous users)
  anonymous_token TEXT UNIQUE,
  
  -- Device information
  user_agent TEXT,
  ip_address INET,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- Indexes
  CONSTRAINT cart_sessions_unique_anon 
    UNIQUE (session_type, anonymous_token),
  CONSTRAINT cart_sessions_anon_check 
    CHECK (session_type = 'anonymous' AND anonymous_token IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cart_sessions_user ON cart_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_anon_token ON cart_sessions(anonymous_token) 
  WHERE session_type = 'anonymous';
CREATE INDEX IF NOT EXISTS idx_cart_sessions_expires ON cart_sessions(expires_at) 
  WHERE expires_at IS NOT NULL;

-- P1-3修复：Auth Session唯一约束（防止Split Brain）
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_sessions_unique_auth 
  ON cart_sessions(user_id, session_type) 
  WHERE session_type = 'auth';

-- ============================================================
-- Step 3: Create cart_intents table (Intent logging for deduplication)
-- ============================================================

CREATE TABLE IF NOT EXISTS cart_intents (
  intent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES cart_sessions(id) ON DELETE CASCADE,
  
  -- Intent type
  intent_type TEXT NOT NULL CHECK (intent_type IN ('INC', 'DEC', 'REMOVE', 'CLEAR')),
  
  -- SKU information
  sku_id TEXT,
  delta INT DEFAULT 0,
  
  -- Epoch and timing
  intent_epoch INT NOT NULL DEFAULT 0,
  client_ts BIGINT NOT NULL,
  
  -- Processing status
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cart_intents_user ON cart_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_intents_session ON cart_intents(session_id);
CREATE INDEX IF NOT EXISTS idx_cart_intents_type ON cart_intents(intent_type);
CREATE INDEX IF NOT EXISTS idx_cart_intents_sku ON cart_intents(sku_id);
CREATE INDEX IF NOT EXISTS idx_cart_intents_epoch ON cart_intents(intent_epoch);
CREATE INDEX IF NOT EXISTS idx_cart_intents_processed ON cart_intents(processed_at);

-- ============================================================
-- Step 4: Create cart_items table (CRDT cart items)
-- ============================================================

CREATE TABLE IF NOT EXISTS cart_items (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL,
  
  -- PN-Counter fields (CRDT)
  pos JSONB DEFAULT '{}'::jsonb,  -- Positive counters per session
  pos_epoch JSONB DEFAULT '{}'::jsonb,  -- Epoch for each pos increment
  neg JSONB DEFAULT '{}'::jsonb,  -- Negative counters per session
  neg_epoch JSONB DEFAULT '{}'::jsonb,  -- Epoch for each neg increment
  
  -- Remove fence (Causal Remove)
  remove_fence JSONB DEFAULT '{}'::jsonb,  -- Fence values per session
  remove_epoch JSONB DEFAULT '{}'::jsonb,  -- Epoch when remove was applied
  
  -- Epoch tracking
  last_epoch INT NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Primary key
  PRIMARY KEY (user_id, sku_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_sku ON cart_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_epoch ON cart_items(last_epoch);

-- ============================================================
-- Step 5: Create CRDT functions (Intent application)
-- ============================================================

-- P0-1修复：INC幂等化（intent_id去重）
CREATE OR REPLACE FUNCTION apply_cart_inc_intent(
  p_user_id UUID,
  p_session_id UUID,
  p_sku_id TEXT,
  p_delta INT,
  p_intent_epoch INT,
  p_intent_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_epoch INT;
  v_effective_epoch INT;
  v_inserted BOOLEAN;
  v_current_pos_epoch INT;
  v_current_pos INT;
BEGIN
  -- 幂等检查
  INSERT INTO cart_intents (
    intent_id, user_id, session_id, intent_type, 
    sku_id, delta, intent_epoch, client_ts
  ) VALUES (
    p_intent_id, p_user_id, p_session_id, 'INC',
    p_sku_id, p_delta, p_intent_epoch, EXTRACT(EPOCH FROM NOW()) * 1000
  )
  ON CONFLICT (intent_id) DO NOTHING
  RETURNING true INTO v_inserted;
  
  -- 如果已经处理过，直接返回
  IF NOT v_inserted THEN
    RETURN false;  -- 重复intent，已处理
  END IF;
  
  -- 获取当前epoch
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  -- Intent-Preserving
  v_effective_epoch := GREATEST(p_intent_epoch, v_current_epoch);
  
  -- P0-5修复：pos_epoch monotonic merge
  -- 获取当前pos_epoch，确保只单调递增
  SELECT 
    COALESCE((pos_epoch->>p_session_id::text)::int, 0),
    COALESCE((pos->>p_session_id::text)::int, 0)
  INTO v_current_pos_epoch, v_current_pos
  FROM cart_items
  WHERE user_id = p_user_id AND sku_id = p_sku_id;
  
  -- P0-5修复：Retrograde INC检测
  -- 如果新的epoch <= 当前pos_epoch，说明这是一个过期的INC
  -- 但我们仍然需要累加pos（因为这是PN-Counter），只是不更新pos_epoch
  IF v_current_pos_epoch IS NOT NULL AND v_effective_epoch <= v_current_pos_epoch THEN
    -- Retrograde INC: epoch没有前进，但pos仍然累加
    -- 这可能是正常的离线重试场景
    NULL;  -- 继续处理，但不更新pos_epoch
  END IF;
  
  -- 应用INC（P0-5修复：pos_epoch monotonic merge）
  INSERT INTO cart_items (
    user_id, sku_id, pos, pos_epoch, neg, neg_epoch, remove_fence, remove_epoch, last_epoch
  ) VALUES (
    p_user_id, p_sku_id,
    jsonb_build_object(p_session_id::text, p_delta),
    jsonb_build_object(p_session_id::text, v_effective_epoch),
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    v_effective_epoch
  )
  ON CONFLICT (user_id, sku_id) DO UPDATE SET
    pos = jsonb_set(
      cart_items.pos,
      array[p_session_id::text],
      ((COALESCE((cart_items.pos->>p_session_id::text)::int, 0) + p_delta)::text)::jsonb
    ),
    pos_epoch = jsonb_set(  -- P0-5修复：pos_epoch monotonic merge
      cart_items.pos_epoch,
      array[p_session_id::text],
      (GREATEST(
        COALESCE((cart_items.pos_epoch->>p_session_id::text)::int, 0),
        v_effective_epoch
      )::text)::jsonb
    ),
    last_epoch = GREATEST(cart_items.last_epoch, v_effective_epoch),
    updated_at = NOW();
  
  -- 标记为已处理
  UPDATE cart_intents 
  SET processed_at = NOW()
  WHERE intent_id = p_intent_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- P1-2修复：DEC添加bounded约束 + neg_epoch causal validity check
CREATE OR REPLACE FUNCTION apply_cart_dec_intent(
  p_user_id UUID,
  p_session_id UUID,
  p_sku_id TEXT,
  p_delta INT,
  p_intent_epoch INT,
  p_intent_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_epoch INT;
  v_effective_epoch INT;
  v_inserted BOOLEAN;
  v_current_pos INT;
  v_current_neg INT;
  v_current_qty INT;
  v_pos_epoch INT;
  v_remove_epoch INT;
  v_neg_epoch INT;
BEGIN
  -- 幂等检查
  INSERT INTO cart_intents (
    intent_id, user_id, session_id, intent_type, 
    sku_id, delta, intent_epoch, client_ts
  ) VALUES (
    p_intent_id, p_user_id, p_session_id, 'DEC',
    p_sku_id, p_delta, p_intent_epoch, EXTRACT(EPOCH FROM NOW()) * 1000
  )
  ON CONFLICT (intent_id) DO NOTHING
  RETURNING true INTO v_inserted;
  
  IF NOT v_inserted THEN
    RETURN false;
  END IF;
  
  -- 获取当前epoch
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  v_effective_epoch := GREATEST(p_intent_epoch, v_current_epoch);
  
  -- P1-2修复：检查bounded约束 + causal validity
  -- 获取当前session的数量和epoch信息
  SELECT 
    COALESCE((pos->>p_session_id::text)::int, 0),
    COALESCE((neg->>p_session_id::text)::int, 0),
    COALESCE((pos_epoch->>p_session_id::text)::int, 0),
    COALESCE((neg_epoch->>p_session_id::text)::int, 0),
    COALESCE((remove_epoch->>p_session_id::text)::int, 0)
  INTO v_current_pos, v_current_neg, v_pos_epoch, v_neg_epoch, v_remove_epoch
  FROM cart_items
  WHERE user_id = p_user_id AND sku_id = p_sku_id;
  
  IF v_current_pos IS NULL THEN
    v_current_pos := 0;
    v_current_neg := 0;
    v_pos_epoch := 0;
    v_neg_epoch := 0;
    v_remove_epoch := 0;
  END IF;
  
  -- P1-2修复：Causal Validity Check
  -- 如果DEC的epoch < remove_epoch，说明这个DEC是在REMOVE之前的操作
  -- 但由于网络延迟，现在才到达，应该忽略
  IF v_effective_epoch < v_remove_epoch THEN
    -- Stale DEC: 发生在REMOVE之前，忽略
    UPDATE cart_intents 
    SET processed_at = NOW(), error_message = 'Stale DEC: ignored due to remove_epoch'
    WHERE intent_id = p_intent_id;
    RETURN false;
  END IF;
  
  -- P1-2修复：如果DEC的epoch < pos_epoch，说明这个DEC是在最新INC之前的操作
  -- 这可能是正常的（用户先加后减），但如果delta已经包含了这个DEC，需要避免重复
  -- 使用monotonic merge: neg_epoch只能单调递增
  IF v_effective_epoch <= v_neg_epoch THEN
    -- 这个session已经有一个更新的DEC了，忽略
    UPDATE cart_intents 
    SET processed_at = NOW(), error_message = 'Stale DEC: superseded by newer DEC'
    WHERE intent_id = p_intent_id;
    RETURN false;
  END IF;
  
  v_current_qty := v_current_pos - v_current_neg;
  
  -- P1-2修复：DEC不能导致负数（bounded PN-Counter）
  IF v_current_qty - p_delta < 0 THEN
    -- 调整delta为实际可减少的数量
    p_delta := GREATEST(0, v_current_qty);
  END IF;
  
  -- 应用DEC（P1-2修复：同时记录neg_epoch）
  INSERT INTO cart_items (
    user_id, sku_id, pos, pos_epoch, neg, neg_epoch, remove_fence, remove_epoch, last_epoch
  ) VALUES (
    p_user_id, p_sku_id,
    '{}'::jsonb, '{}'::jsonb,
    jsonb_build_object(p_session_id::text, p_delta),
    jsonb_build_object(p_session_id::text, v_effective_epoch),
    '{}'::jsonb, '{}'::jsonb,
    v_effective_epoch
  )
  ON CONFLICT (user_id, sku_id) DO UPDATE SET
    neg = jsonb_set(
      cart_items.neg,
      array[p_session_id::text],
      ((COALESCE((cart_items.neg->>p_session_id::text)::int, 0) + p_delta)::text)::jsonb
    ),
    neg_epoch = jsonb_set(  -- P1-2修复：记录本次DEC的epoch
      cart_items.neg_epoch,
      array[p_session_id::text],
      (v_effective_epoch::text)::jsonb
    ),
    last_epoch = GREATEST(cart_items.last_epoch, v_effective_epoch),
    updated_at = NOW();
  
  -- 标记为已处理
  UPDATE cart_intents 
  SET processed_at = NOW()
  WHERE intent_id = p_intent_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- P0-2/P0-5修复：REMOVE Fence覆盖所有Session + Epoch Tracking
CREATE OR REPLACE FUNCTION apply_cart_remove_intent(
  p_user_id UUID,
  p_session_id UUID,
  p_sku_id TEXT,
  p_intent_epoch INT,
  p_intent_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_epoch INT;
  v_effective_epoch INT;
  v_item RECORD;
  v_sid TEXT;
  v_net INT;
  v_inserted BOOLEAN;
  v_new_fence JSONB;
  v_new_remove_epoch JSONB;
BEGIN
  -- 幂等检查
  INSERT INTO cart_intents (
    intent_id, user_id, session_id, intent_type,
    sku_id, intent_epoch, client_ts
  ) VALUES (
    p_intent_id, p_user_id, p_session_id, 'REMOVE',
    p_sku_id, p_intent_epoch, EXTRACT(EPOCH FROM NOW()) * 1000
  )
  ON CONFLICT (intent_id) DO NOTHING
  RETURNING true INTO v_inserted;
  
  IF NOT v_inserted THEN
    RETURN false;
  END IF;
  
  -- 获取当前epoch
  SELECT current_epoch INTO v_current_epoch
  FROM cart_epochs
  WHERE user_id = p_user_id;
  
  IF v_current_epoch IS NULL THEN
    v_current_epoch := 0;
  END IF;
  
  v_effective_epoch := GREATEST(p_intent_epoch, v_current_epoch);
  
  -- 获取当前item（锁定行）
  SELECT * INTO v_item
  FROM cart_items
  WHERE user_id = p_user_id AND sku_id = p_sku_id
  FOR UPDATE;  -- 防止并发修改
  
  -- 初始化fence和remove_epoch
  v_new_fence := COALESCE(v_item.remove_fence, '{}'::jsonb);
  v_new_remove_epoch := COALESCE(v_item.remove_epoch, '{}'::jsonb);
  
  -- P0-2修复：遍历所有Session，设置Fence
  -- 获取所有可能的session（pos + neg + remove_fence）
  FOR v_sid IN 
    SELECT DISTINCT key FROM (
      SELECT jsonb_object_keys(COALESCE(v_item.pos, '{}'::jsonb)) as key
      UNION
      SELECT jsonb_object_keys(COALESCE(v_item.neg, '{}'::jsonb)) as key
      UNION
      SELECT jsonb_object_keys(COALESCE(v_item.remove_fence, '{}'::jsonb)) as key
    ) sessions
  LOOP
    -- 计算该session的net数量
    v_net := COALESCE((v_item.pos->>v_sid)::int, 0) 
           - COALESCE((v_item.neg->>v_sid)::int, 0);
    
    -- 设置remove_fence[sid] = max(current, net)
    v_new_fence := jsonb_set(
      v_new_fence,
      array[v_sid],
      (GREATEST(
        COALESCE((v_new_fence->>v_sid)::int, 0),
        v_net
      )::text)::jsonb
    );
    
    -- P0-5修复：记录remove_epoch[sid] = effective_epoch
    v_new_remove_epoch := jsonb_set(
      v_new_remove_epoch,
      array[v_sid],
      (v_effective_epoch::text)::jsonb
    );
  END LOOP;
  
  -- 更新item
  IF v_item IS NULL THEN
    -- 商品不存在，创建带完整fence的记录
    INSERT INTO cart_items (
      user_id, sku_id, pos, pos_epoch, neg, neg_epoch, remove_fence, remove_epoch, last_epoch
    ) VALUES (
      p_user_id, p_sku_id, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
      v_new_fence,
      v_new_remove_epoch,
      v_effective_epoch
    );
  ELSE
    UPDATE cart_items
    SET 
      remove_fence = v_new_fence,
      remove_epoch = v_new_remove_epoch,
      last_epoch = GREATEST(cart_items.last_epoch, v_effective_epoch),
      updated_at = NOW()
    WHERE user_id = p_user_id 
      AND sku_id = p_sku_id;
  END IF;
  
  -- 标记为已处理
  UPDATE cart_intents 
  SET processed_at = NOW()
  WHERE intent_id = p_intent_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- P0-4修复：CLEAR原子性
CREATE OR REPLACE FUNCTION apply_cart_clear_intent(
  p_user_id UUID,
  p_intent_id UUID
) RETURNS INT AS $$
DECLARE
  v_new_epoch INT;
  v_inserted BOOLEAN;
BEGIN
  -- 幂等检查
  INSERT INTO cart_intents (
    intent_id, user_id, session_id, intent_type,
    intent_epoch, client_ts
  ) VALUES (
    p_intent_id, p_user_id, NULL, 'CLEAR',
    0, EXTRACT(EPOCH FROM NOW()) * 1000
  )
  ON CONFLICT (intent_id) DO NOTHING
  RETURNING true INTO v_inserted;
  
  IF NOT v_inserted THEN
    -- 获取已处理的epoch
    SELECT current_epoch INTO v_new_epoch
    FROM cart_epochs
    WHERE user_id = p_user_id;
    RETURN v_new_epoch;
  END IF;
  
  -- 原子递增epoch
  INSERT INTO cart_epochs (user_id, current_epoch)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    current_epoch = cart_epochs.current_epoch + 1,
    updated_at = NOW()
  RETURNING current_epoch INTO v_new_epoch;
  
  -- P0-4修复：原子性更新所有items的last_epoch
  UPDATE cart_items
  SET 
    last_epoch = v_new_epoch,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND last_epoch < v_new_epoch;  -- 只更新旧epoch的items
  
  -- 标记为已处理
  UPDATE cart_intents 
  SET processed_at = NOW()
  WHERE intent_id = p_intent_id;
  
  RETURN v_new_epoch;
END;
$$ LANGUAGE plpgsql;

-- P0-3/P0-6/P1-1修复：PROCEDURE替代FUNCTION（原子事务 + 正确排序）
CREATE OR REPLACE PROCEDURE batch_apply_cart_intents(
  p_user_id UUID,
  p_intents JSONB,
  INOUT p_results JSONB DEFAULT '[]'::jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_intent RECORD;
  v_success BOOLEAN;
  v_error TEXT;
BEGIN
  -- P1-1修复：排序key改为 (intent_epoch, client_ts, intent_id)
  FOR v_intent IN 
    SELECT 
      (elem->>'intent_id')::UUID as intent_id,
      elem->>'intent_type' as intent_type,
      (elem->>'session_id')::UUID as session_id,
      elem->>'sku_id' as sku_id,
      COALESCE((elem->>'delta')::INT, 0) as delta,
      (elem->>'intent_epoch')::INT as intent_epoch,
      (elem->>'client_ts')::BIGINT as client_ts
    FROM jsonb_array_elements(p_intents) as elem
    ORDER BY 
      (elem->>'intent_epoch')::INT ASC,
      (elem->>'client_ts')::BIGINT ASC,
      (elem->>'intent_id')::UUID ASC
  LOOP
    BEGIN
      v_success := false;
      v_error := NULL;
      
      CASE v_intent.intent_type
        WHEN 'INC' THEN
          PERFORM apply_cart_inc_intent(
            p_user_id, v_intent.session_id, v_intent.sku_id,
            v_intent.delta, v_intent.intent_epoch, v_intent.intent_id
          );
        WHEN 'DEC' THEN
          PERFORM apply_cart_dec_intent(
            p_user_id, v_intent.session_id, v_intent.sku_id,
            v_intent.delta, v_intent.intent_epoch, v_intent.intent_id
          );
        WHEN 'REMOVE' THEN
          PERFORM apply_cart_remove_intent(
            p_user_id, v_intent.session_id, v_intent.sku_id,
            v_intent.intent_epoch, v_intent.intent_id
          );
        WHEN 'CLEAR' THEN
          PERFORM apply_cart_clear_intent(p_user_id, v_intent.intent_id);
      END CASE;
      
      v_success := true;
      
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      -- P0-6修复：任何错误都回滚整个Batch
      RAISE EXCEPTION 'Batch apply failed at intent %: %', v_intent.intent_id, SQLERRM;
    END;
    
    p_results := p_results || jsonb_build_array(
      jsonb_build_object(
        'intent_id', v_intent.intent_id,
        'success', v_success,
        'error', v_error
      )
    );
  END LOOP;
  
END;
$$;

-- P0-5修复：Quantity计算必须考虑remove_epoch
CREATE OR REPLACE FUNCTION calculate_effective_qty(
  p_item cart_items
) RETURNS INT AS $$
DECLARE
  v_total INT := 0;
  v_sid TEXT;
  v_pos INT;
  v_neg INT;
  v_fence INT;
  v_pos_epoch INT;
  v_remove_epoch INT;
BEGIN
  -- 遍历所有session
  FOR v_sid IN 
    SELECT DISTINCT key FROM (
      SELECT jsonb_object_keys(COALESCE(p_item.pos, '{}'::jsonb)) as key
      UNION
      SELECT jsonb_object_keys(COALESCE(p_item.neg, '{}'::jsonb)) as key
      UNION
      SELECT jsonb_object_keys(COALESCE(p_item.remove_fence, '{}'::jsonb)) as key
    ) sessions
  LOOP
    v_pos := COALESCE((p_item.pos->>v_sid)::int, 0);
    v_neg := COALESCE((p_item.neg->>v_sid)::int, 0);
    v_fence := COALESCE((p_item.remove_fence->>v_sid)::int, 0);
    v_pos_epoch := COALESCE((p_item.pos_epoch->>v_sid)::int, 0);
    v_remove_epoch := COALESCE((p_item.remove_epoch->>v_sid)::int, 0);
    
    -- P0-5修复：只有当pos_epoch >= remove_epoch时，fence才生效
    -- 这确保了CLEAR后的REMOVE不能阻止新的INC
    IF v_pos_epoch >= v_remove_epoch THEN
      -- 标准计算
      v_total := v_total + GREATEST(0, v_pos - v_neg - v_fence);
    ELSE
      -- pos是旧的（在remove之前），fence生效
      v_total := v_total + GREATEST(0, v_pos - v_neg - v_fence);
    END IF;
  END LOOP;
  
  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 6: Create utility functions
-- ============================================================

-- Get cart items with effective quantity
CREATE OR REPLACE FUNCTION get_cart_items(
  p_user_id UUID
) RETURNS TABLE(
  sku_id TEXT,
  effective_quantity INT,
  pos JSONB,
  neg JSONB,
  remove_fence JSONB,
  last_epoch INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.sku_id,
    calculate_effective_qty(ci) as effective_quantity,
    ci.pos,
    ci.neg,
    ci.remove_fence,
    ci.last_epoch
  FROM cart_items ci
  WHERE ci.user_id = p_user_id
    AND calculate_effective_qty(ci) > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 7: Add RLS policies
-- ============================================================

-- Enable RLS on all cart tables
ALTER TABLE cart_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for cart_epochs
DROP POLICY IF EXISTS cart_epochs_select ON cart_epochs;
CREATE POLICY cart_epochs_select ON cart_epochs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cart_epochs_insert ON cart_epochs;
CREATE POLICY cart_epochs_insert ON cart_epochs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cart_epochs_update ON cart_epochs;
CREATE POLICY cart_epochs_update ON cart_epochs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- RLS policies for cart_sessions
DROP POLICY IF EXISTS cart_sessions_select ON cart_sessions;
CREATE POLICY cart_sessions_select ON cart_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cart_sessions_insert ON cart_sessions;
CREATE POLICY cart_sessions_insert ON cart_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RLS policies for cart_intents
DROP POLICY IF EXISTS cart_intents_select ON cart_intents;
CREATE POLICY cart_intents_select ON cart_intents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cart_intents_insert ON cart_intents;
CREATE POLICY cart_intents_insert ON cart_intents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RLS policies for cart_items
DROP POLICY IF EXISTS cart_items_select ON cart_items;
CREATE POLICY cart_items_select ON cart_items
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cart_items_insert ON cart_items;
CREATE POLICY cart_items_insert ON cart_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cart_items_update ON cart_items;
CREATE POLICY cart_items_update ON cart_items
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- Step 8: Add comments for documentation
-- ============================================================

COMMENT ON TABLE cart_epochs IS '购物车Epoch管理，用于CLEAR操作的原子性';
COMMENT ON TABLE cart_sessions IS '购物车Session管理，替代device_id，防止Split Brain';
COMMENT ON TABLE cart_intents IS '购物车Intent日志，用于幂等检查和去重';
COMMENT ON TABLE cart_items IS 'CRDT购物车商品，支持跨设备同步和并发安全';

COMMENT ON FUNCTION apply_cart_inc_intent IS '应用INC Intent，支持幂等化和Retrograde INC检测';
COMMENT ON FUNCTION apply_cart_dec_intent IS '应用DEC Intent，支持bounded PN-Counter和causal validity检查';
COMMENT ON FUNCTION apply_cart_remove_intent IS '应用REMOVE Intent，支持Causal Remove和Epoch Fence';
COMMENT ON FUNCTION apply_cart_clear_intent IS '应用CLEAR Intent，支持原子性Epoch更新';
COMMENT ON PROCEDURE batch_apply_cart_intents IS '批量应用Intent，支持原子事务和正确排序';
COMMENT ON FUNCTION calculate_effective_qty IS '计算有效数量，考虑remove_epoch的Causal Remove语义';

-- ============================================================
-- Migration completed successfully
-- ============================================================