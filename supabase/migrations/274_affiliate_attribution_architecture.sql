-- ============================================================
-- 金融级联盟归因架构迁移
-- 包含：affiliate_clicks, affiliate_checkout_locks, 
--       affiliate_attribution_snapshot, commission_ledger
-- 以及所有安全约束和 RPC 函数
-- ============================================================

-- ============================================================
-- 1. affiliate_clicks 表（点击事件）
-- ============================================================
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 归因主键
  affiliate_post_id UUID NOT NULL REFERENCES affiliate_posts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- 点击者信息
  visitor_id TEXT,
  user_id UUID REFERENCES profiles(id),
  
  -- 点击时间
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 归因窗口（生成时固化）
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- 设备指纹（风控）
  ip_hash TEXT,
  user_agent_hash TEXT,
  device_fingerprint TEXT,
  
  -- 时间字段模型（替代状态字符串）
  used_at TIMESTAMPTZ,
  fraud_marked_at TIMESTAMPTZ,
  
  -- 关联订单
  order_id UUID REFERENCES orders(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate_post_id ON affiliate_clicks(affiliate_post_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate_id ON affiliate_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_visitor_id ON affiliate_clicks(visitor_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user_id ON affiliate_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_expires_at ON affiliate_clicks(expires_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_unused ON affiliate_clicks(used_at) WHERE used_at IS NULL;

-- 🔒 唯一约束：防止同一个 click 被关联多个订单
CREATE UNIQUE INDEX IF NOT EXISTS uniq_click_order ON affiliate_clicks(order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE affiliate_clicks IS '点击事件记录，归因的动态事件层';
COMMENT ON COLUMN affiliate_clicks.visitor_id IS '匿名访客标识，用于所有权验证';
COMMENT ON COLUMN affiliate_clicks.expires_at IS '归因窗口过期时间，规则在 click 生成时固化';

-- ============================================================
-- 2. affiliate_checkout_locks 表（归因锁定）
-- ============================================================
CREATE TABLE IF NOT EXISTS affiliate_checkout_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 关联的 click
  click_id UUID NOT NULL REFERENCES affiliate_clicks(id) ON DELETE CASCADE,
  
  -- 🔒 锁定者信息（用于所有权验证）
  visitor_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id),
  
  -- 锁定时刻
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 🔒 TTL：防止佣金拒绝攻击
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- 消费时刻（下单时）
  used_at TIMESTAMPTZ,
  
  -- 关联订单
  order_id UUID REFERENCES orders(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🔒 核心约束：一个 click 只能有一个未使用的 lock
-- 注意：expires_at 条件在应用层/RPC 中处理，不能在索引中使用 NOW()
CREATE UNIQUE INDEX IF NOT EXISTS uniq_checkout_lock_click ON affiliate_checkout_locks(click_id) 
WHERE used_at IS NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_checkout_locks_visitor_id ON affiliate_checkout_locks(visitor_id);
CREATE INDEX IF NOT EXISTS idx_checkout_locks_user_id ON affiliate_checkout_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_checkout_locks_expires_at ON affiliate_checkout_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_checkout_locks_unused ON affiliate_checkout_locks(used_at) WHERE used_at IS NULL;

COMMENT ON TABLE affiliate_checkout_locks IS 'Checkout 归因锁定，在用户进入结算页时锁定归因';
COMMENT ON COLUMN affiliate_checkout_locks.visitor_id IS '锁定者标识，下单时必须匹配';
COMMENT ON COLUMN affiliate_checkout_locks.expires_at IS '锁过期时间，防止佣金拒绝攻击';

-- ============================================================
-- 3. affiliate_attribution_snapshot 表（不可变快照）
-- ============================================================
CREATE TABLE IF NOT EXISTS affiliate_attribution_snapshot (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 关联
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  click_id UUID NOT NULL REFERENCES affiliate_clicks(id),
  checkout_lock_id UUID REFERENCES affiliate_checkout_locks(id),
  
  -- 归因主体
  affiliate_id UUID NOT NULL REFERENCES profiles(id),
  product_id UUID NOT NULL REFERENCES products(id),
  
  -- 冻结的佣金数据（不可变）
  commission_rate NUMERIC(5,2) NOT NULL,
  commission_amount NUMERIC(10,2) NOT NULL,
  
  -- 冻结的订单数据
  order_currency TEXT NOT NULL,
  order_total NUMERIC(10,2) NOT NULL,
  order_quantity INT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🔒 唯一约束：一个 order 只能有一个 snapshot
CREATE UNIQUE INDEX IF NOT EXISTS uniq_snapshot_order ON affiliate_attribution_snapshot(order_id);

-- 🔒 Trigger 强制不可变
CREATE OR REPLACE FUNCTION prevent_snapshot_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'affiliate_attribution_snapshot is immutable and cannot be updated';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS snapshot_immutable ON affiliate_attribution_snapshot;
CREATE TRIGGER snapshot_immutable
  BEFORE UPDATE ON affiliate_attribution_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_update();

-- 索引
CREATE INDEX IF NOT EXISTS idx_affiliate_snapshot_affiliate_id ON affiliate_attribution_snapshot(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_snapshot_click_id ON affiliate_attribution_snapshot(click_id);

COMMENT ON TABLE affiliate_attribution_snapshot IS '佣金快照，冻结订单创建时的佣金数据，不可变';

-- ============================================================
-- 4. commission_ledger 表（只追加账本）
-- ============================================================
CREATE TABLE IF NOT EXISTS commission_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- 关联
  snapshot_id UUID NOT NULL REFERENCES affiliate_attribution_snapshot(id),
  affiliate_id UUID NOT NULL REFERENCES profiles(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  
  -- 金额（正数为佣金，负数为退款/调整）
  amount NUMERIC(10,2) NOT NULL,
  
  -- 类型
  entry_type TEXT NOT NULL CHECK (entry_type IN ('commission', 'refund', 'adjustment', 'payout')),
  
  -- 描述
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🔒 唯一约束：防止同一 snapshot 被插入两次 'commission'
CREATE UNIQUE INDEX IF NOT EXISTS uniq_commission_entry ON commission_ledger(snapshot_id) WHERE entry_type = 'commission';

-- 🔒 Trigger 强制禁止 UPDATE 和 DELETE
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'commission_ledger is append-only and cannot be updated';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commission_ledger is append-only and cannot be deleted';
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON commission_ledger;
CREATE TRIGGER ledger_no_update
  BEFORE UPDATE ON commission_ledger
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_modification();

DROP TRIGGER IF EXISTS ledger_no_delete ON commission_ledger;
CREATE TRIGGER ledger_no_delete
  BEFORE DELETE ON commission_ledger
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_modification();

-- 索引
CREATE INDEX IF NOT EXISTS idx_commission_ledger_affiliate_id ON commission_ledger(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_snapshot_id ON commission_ledger(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_order_id ON commission_ledger(order_id);

COMMENT ON TABLE commission_ledger IS '佣金账本，只追加不可修改，金融级审计';

-- ============================================================
-- 5. 修改 orders 表
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS click_id UUID REFERENCES affiliate_clicks(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_lock_id UUID REFERENCES affiliate_checkout_locks(id);

-- 🔒 Trigger 防更新归因字段
CREATE OR REPLACE FUNCTION prevent_attribution_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.click_id IS NOT NULL AND NEW.click_id IS DISTINCT FROM OLD.click_id THEN
    RAISE EXCEPTION 'click_id cannot be updated once set';
  END IF;
  IF OLD.checkout_lock_id IS NOT NULL AND NEW.checkout_lock_id IS DISTINCT FROM OLD.checkout_lock_id THEN
    RAISE EXCEPTION 'checkout_lock_id cannot be updated once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_attribution_immutable ON orders;
CREATE TRIGGER orders_attribution_immutable
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_attribution_update();

COMMENT ON COLUMN orders.click_id IS '关联的点击事件，不可变';
COMMENT ON COLUMN orders.checkout_lock_id IS '关联的结算锁，不可变';

-- ============================================================
-- 6. 启用 RLS
-- ============================================================
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_checkout_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_attribution_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. RLS 策略
-- ============================================================

-- affiliate_clicks: 用户可查看自己的点击
CREATE POLICY "Users can view own clicks" ON affiliate_clicks
  FOR SELECT USING (auth.uid() = affiliate_id OR auth.uid() = user_id);

-- affiliate_checkout_locks: 仅服务端访问
CREATE POLICY "Service role only for checkout_locks" ON affiliate_checkout_locks
  FOR ALL USING (auth.role() = 'service_role');

-- affiliate_attribution_snapshot: 用户可查看自己的快照
CREATE POLICY "Users can view own snapshots" ON affiliate_attribution_snapshot
  FOR SELECT USING (auth.uid() = affiliate_id);

-- commission_ledger: 用户可查看自己的账本
CREATE POLICY "Users can view own ledger" ON commission_ledger
  FOR SELECT USING (auth.uid() = affiliate_id);
