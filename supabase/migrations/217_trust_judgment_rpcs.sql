-- Phase 2 trust judgment: seller trust stats and product price range RPCs
-- Used by GET /api/trust/judgment for 判断 + 证据 + 可反对 (70% rules, no ML)

-- 1. Seller trust stats: completed orders count, disputes in last 90 days (aggregates only)
CREATE OR REPLACE FUNCTION get_seller_trust_stats(p_seller_id UUID)
RETURNS TABLE (
  completed_orders_count BIGINT,
  disputes_last_90_days BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::BIGINT FROM orders o WHERE o.seller_id = p_seller_id AND o.order_status = 'completed'),
    (SELECT COUNT(*)::BIGINT
     FROM order_disputes d
     JOIN orders o ON o.id = d.order_id AND o.seller_id = p_seller_id
     WHERE d.created_at >= (NOW() - INTERVAL '90 days'));
$$;

COMMENT ON FUNCTION get_seller_trust_stats(UUID) IS 'Phase 2 trust judgment: seller completed orders and disputes in last 90 days (aggregates only, no row-level data).';

-- 2. Product price range from recent completed orders (for evidence: price in/out of range)
CREATE OR REPLACE FUNCTION get_product_price_range(p_product_id UUID)
RETURNS TABLE (
  min_price NUMERIC,
  max_price NUMERIC,
  sample_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(MIN(o.unit_price), 0)::NUMERIC,
    COALESCE(MAX(o.unit_price), 0)::NUMERIC,
    COUNT(*)::BIGINT
  FROM orders o
  WHERE o.product_id = p_product_id
    AND o.order_status = 'completed'
    AND o.created_at >= (NOW() - INTERVAL '1 year');
$$;

COMMENT ON FUNCTION get_product_price_range(UUID) IS 'Phase 2 trust judgment: min/max unit_price and count of completed orders for product in last year.';

-- 3. Table for "可反对" feedback (optional first version; used for future rule tuning)
CREATE TABLE IF NOT EXISTS trust_judgment_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agreed BOOLEAN NOT NULL,
  reason TEXT CHECK (reason IS NULL OR reason IN ('price', 'seller', 'description')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_judgment_feedback_product_seller ON trust_judgment_feedback(product_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_trust_judgment_feedback_created ON trust_judgment_feedback(created_at DESC);

ALTER TABLE trust_judgment_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY trust_judgment_feedback_insert_own ON trust_judgment_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY trust_judgment_feedback_select_own ON trust_judgment_feedback
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE trust_judgment_feedback IS 'Phase 2: user agree/disagree with trust judgment; reason when disagree (price/seller/description).';
