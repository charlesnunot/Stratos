-- ============================================================
-- 金融级联盟归因 RPC 函数
-- 包含：create_checkout_lock, create_attributed_order, 
--       issue_commission_refund
-- ============================================================

-- ============================================================
-- 1. create_checkout_lock（原子创建锁，验证 click 有效性）
-- ============================================================
CREATE OR REPLACE FUNCTION create_checkout_lock(
  p_click_id UUID,
  p_visitor_id TEXT,
  p_user_id UUID,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE(id UUID, click_id UUID) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO affiliate_checkout_locks (click_id, visitor_id, user_id, expires_at)
  SELECT 
    c.id,
    p_visitor_id,
    p_user_id,
    p_expires_at
  FROM affiliate_clicks c
  WHERE 
    c.id = p_click_id
    AND c.used_at IS NULL
    AND c.expires_at > NOW()
    AND NOT EXISTS (
      SELECT 1 FROM affiliate_checkout_locks l 
      WHERE l.click_id = p_click_id 
      AND l.used_at IS NULL 
      AND l.expires_at > NOW()
    )
  RETURNING affiliate_checkout_locks.id, affiliate_checkout_locks.click_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_checkout_lock IS '原子创建 checkout lock，验证 click 有效性';

-- ============================================================
-- 1.5 consume_checkout_lock（原子消费锁，验证所有权和有效期）
-- ============================================================
CREATE OR REPLACE FUNCTION consume_checkout_lock(
  p_lock_id UUID,
  p_order_id UUID,
  p_visitor_id TEXT,
  p_user_id UUID
)
RETURNS TABLE(id UUID, click_id UUID) AS $$
BEGIN
  RETURN QUERY
  UPDATE affiliate_checkout_locks
  SET 
    used_at = NOW(),
    order_id = p_order_id
  WHERE 
    id = p_lock_id
    AND used_at IS NULL
    AND expires_at > NOW()
    AND (
      visitor_id = p_visitor_id
      OR (user_id IS NOT NULL AND user_id = p_user_id)
    )
  RETURNING affiliate_checkout_locks.id, affiliate_checkout_locks.click_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_checkout_lock IS '原子消费 checkout lock，验证所有权和有效期';

-- ============================================================
-- 2. create_attributed_order（单事务创建归因订单）
-- 🔒 P0-4 修复：lock 消费 + 订单创建 + snapshot + ledger 在一个事务内
-- ============================================================
CREATE OR REPLACE FUNCTION create_attributed_order(
  -- 订单基础信息
  p_order_number TEXT,
  p_buyer_id UUID,
  p_seller_id UUID,
  p_total_amount NUMERIC(10,2),
  p_currency TEXT DEFAULT 'USD',
  p_payment_method TEXT DEFAULT NULL,
  p_shipping_address JSONB DEFAULT NULL,
  p_shipping_fee NUMERIC(10,2) DEFAULT 0,
  
  -- 归因信息
  p_checkout_lock_id UUID DEFAULT NULL,
  p_visitor_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  
  -- 商品信息（用于佣金计算）
  p_product_id UUID DEFAULT NULL,
  p_quantity INT DEFAULT 1,
  p_unit_price NUMERIC(10,2) DEFAULT 0,
  p_commission_rate NUMERIC(5,2) DEFAULT 0
)
RETURNS TABLE(
  order_id UUID,
  order_number TEXT,
  click_id UUID,
  affiliate_id UUID,
  commission_amount NUMERIC(10,2),
  attribution_success BOOLEAN
) AS $$
DECLARE
  v_click_id UUID;
  v_affiliate_id UUID;
  v_order_id UUID;
  v_snapshot_id UUID;
  v_commission_amount NUMERIC(10,2) := 0;
  v_attribution_success BOOLEAN := FALSE;
BEGIN
  -- Step 1: 尝试消费 checkout lock（验证所有权和有效期）
  IF p_checkout_lock_id IS NOT NULL THEN
    UPDATE affiliate_checkout_locks
    SET 
      used_at = NOW(),
      order_id = uuid_nil()
    WHERE 
      id = p_checkout_lock_id
      AND used_at IS NULL
      AND expires_at > NOW()
      AND (
        visitor_id = p_visitor_id
        OR (user_id IS NOT NULL AND user_id = p_user_id)
      )
    RETURNING affiliate_checkout_locks.click_id INTO v_click_id;
    
    IF v_click_id IS NOT NULL THEN
      -- 获取 affiliate_id
      SELECT affiliate_id INTO v_affiliate_id
      FROM affiliate_clicks
      WHERE id = v_click_id;
      
      -- 防自买自赚
      IF v_affiliate_id = p_buyer_id THEN
        v_click_id := NULL;
        v_affiliate_id := NULL;
      ELSE
        v_attribution_success := TRUE;
      END IF;
    END IF;
  END IF;
  
  -- Step 2: 创建订单
  INSERT INTO orders (
    order_number,
    buyer_id,
    seller_id,
    total_amount,
    currency,
    payment_method,
    shipping_address,
    shipping_fee,
    product_id,
    quantity,
    unit_price,
    click_id,
    checkout_lock_id,
    payment_status,
    order_status
  ) VALUES (
    p_order_number,
    p_buyer_id,
    p_seller_id,
    p_total_amount,
    p_currency,
    p_payment_method,
    p_shipping_address,
    p_shipping_fee,
    p_product_id,
    p_quantity,
    p_unit_price,
    v_click_id,
    p_checkout_lock_id,
    'pending',
    'pending'
  )
  RETURNING orders.id INTO v_order_id;
  
  -- 更新 lock 的 order_id
  IF v_click_id IS NOT NULL AND p_checkout_lock_id IS NOT NULL THEN
    UPDATE affiliate_checkout_locks
    SET order_id = v_order_id
    WHERE id = p_checkout_lock_id;
    
    -- 更新 click 的 used_at 和 order_id
    UPDATE affiliate_clicks
    SET 
      used_at = NOW(),
      order_id = v_order_id
    WHERE id = v_click_id;
  END IF;
  
  -- Step 3: 创建 snapshot 和 ledger（如果有归因）
  IF v_attribution_success AND v_affiliate_id IS NOT NULL AND p_commission_rate > 0 THEN
    v_commission_amount := p_total_amount * p_commission_rate / 100;
    
    -- 创建 snapshot
    INSERT INTO affiliate_attribution_snapshot (
      order_id,
      click_id,
      checkout_lock_id,
      affiliate_id,
      product_id,
      commission_rate,
      commission_amount,
      order_currency,
      order_total,
      order_quantity
    ) VALUES (
      v_order_id,
      v_click_id,
      p_checkout_lock_id,
      v_affiliate_id,
      p_product_id,
      p_commission_rate,
      v_commission_amount,
      p_currency,
      p_total_amount,
      p_quantity
    )
    RETURNING affiliate_attribution_snapshot.id INTO v_snapshot_id;
    
    -- 创建 ledger entry
    INSERT INTO commission_ledger (
      snapshot_id,
      affiliate_id,
      order_id,
      amount,
      entry_type,
      description
    ) VALUES (
      v_snapshot_id,
      v_affiliate_id,
      v_order_id,
      v_commission_amount,
      'commission',
      'Commission for order ' || p_order_number
    );
  END IF;
  
  -- 返回结果
  RETURN QUERY SELECT 
    v_order_id,
    p_order_number,
    v_click_id,
    v_affiliate_id,
    v_commission_amount,
    v_attribution_success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_attributed_order IS '单事务创建归因订单，包含 lock 消费、订单创建、snapshot 和 ledger';

-- ============================================================
-- 3. issue_commission_refund（退款处理，验证金额上限）
-- 🔒 P0-5 修复：退款金额不能超过佣金金额
-- ============================================================
CREATE OR REPLACE FUNCTION issue_commission_refund(
  p_order_id UUID,
  p_refund_amount NUMERIC(10,2),
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  ledger_id UUID
) AS $$
DECLARE
  v_snapshot RECORD;
  v_total_refunded NUMERIC(10,2);
  v_remaining NUMERIC(10,2);
  v_ledger_id UUID;
BEGIN
  -- 获取 snapshot
  SELECT * INTO v_snapshot
  FROM affiliate_attribution_snapshot
  WHERE order_id = p_order_id;
  
  IF v_snapshot IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No attribution found for this order', NULL::UUID;
    RETURN;
  END IF;
  
  -- 计算已退款总额
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_refunded
  FROM commission_ledger
  WHERE snapshot_id = v_snapshot.id
  AND entry_type = 'refund';
  
  -- 计算剩余可退款金额
  v_remaining := v_snapshot.commission_amount - v_total_refunded;
  
  -- 🔒 验证：退款金额不能超过剩余可退款金额
  IF p_refund_amount > v_remaining THEN
    RETURN QUERY SELECT FALSE, 
      'Refund amount exceeds remaining commission. Max allowed: ' || v_remaining, 
      NULL::UUID;
    RETURN;
  END IF;
  
  -- 插入退款 ledger
  INSERT INTO commission_ledger (
    snapshot_id,
    affiliate_id,
    order_id,
    amount,
    entry_type,
    description
  ) VALUES (
    v_snapshot.id,
    v_snapshot.affiliate_id,
    p_order_id,
    -p_refund_amount,
    'refund',
    COALESCE(p_reason, 'Order refund')
  )
  RETURNING commission_ledger.id INTO v_ledger_id;
  
  RETURN QUERY SELECT TRUE, 'Refund issued successfully', v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION issue_commission_refund IS '处理退款，验证退款金额不超过剩余佣金';

-- ============================================================
-- 4. get_affiliate_balance（查询余额，实时计算）
-- ============================================================
CREATE OR REPLACE FUNCTION get_affiliate_balance(
  p_affiliate_id UUID
)
RETURNS NUMERIC(10,2) AS $$
DECLARE
  v_balance NUMERIC(10,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM commission_ledger
  WHERE affiliate_id = p_affiliate_id;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_affiliate_balance IS '查询 Affiliate 余额，实时计算 SUM(ledger)';
