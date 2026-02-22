-- Direct seller: profiles.seller_type, orders snapshot and funds_recipient
-- Cold start: platform-operated sellers (direct) use platform payment account; identity not exposed to buyers.

-- ============================================
-- 1. profiles.seller_type
-- ============================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seller_type TEXT
  CHECK (seller_type IN ('external', 'direct'))
  DEFAULT 'external';

CREATE INDEX IF NOT EXISTS idx_profiles_seller_type ON profiles(seller_type) WHERE seller_type IS NOT NULL;
COMMENT ON COLUMN profiles.seller_type IS 'Seller identity: external (third-party) or direct (platform-operated). Direct uses platform payment account. For cold start only admin and the seller themselves see this.';

-- ============================================
-- 2. orders: seller_type_snapshot + funds_recipient
-- ============================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_type_snapshot TEXT CHECK (seller_type_snapshot IN ('external', 'direct')),
  ADD COLUMN IF NOT EXISTS funds_recipient TEXT CHECK (funds_recipient IN ('platform', 'seller'));

-- Backfill existing orders: all current orders are external → seller
UPDATE orders SET funds_recipient = 'seller' WHERE funds_recipient IS NULL;
UPDATE orders SET seller_type_snapshot = 'external' WHERE seller_type_snapshot IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_seller_type_snapshot ON orders(seller_type_snapshot) WHERE seller_type_snapshot IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_funds_recipient ON orders(funds_recipient) WHERE funds_recipient IS NOT NULL;

COMMENT ON COLUMN orders.seller_type_snapshot IS 'Snapshot of seller_type at order creation; used for payment/refund/reconciliation (financial defense).';
COMMENT ON COLUMN orders.funds_recipient IS 'Where funds go: platform (direct seller) or seller (external). For reconciliation and refunds.';

-- ============================================
-- 3. seller_type_audit_logs (funds flow switch)
-- ============================================
CREATE TABLE IF NOT EXISTS seller_type_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  operator_admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  before_type TEXT NOT NULL CHECK (before_type IN ('external', 'direct')),
  after_type TEXT NOT NULL CHECK (after_type IN ('external', 'direct')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_type_audit_seller ON seller_type_audit_logs(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_type_audit_operator ON seller_type_audit_logs(operator_admin_id);
CREATE INDEX IF NOT EXISTS idx_seller_type_audit_created ON seller_type_audit_logs(created_at DESC);

COMMENT ON TABLE seller_type_audit_logs IS 'Audit trail for seller_type changes (external <-> direct). Funds flow switch; required for compliance and troubleshooting.';
