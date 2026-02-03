-- Phase 2 信任判断：RPC 支持可调参数（dispute_window_days / price_history_window_days）
-- 与 src/lib/trust-judgment/config.ts 配合，产品/运营可调 30–180 天纠纷窗口、180–730 天价格历史

-- 1. get_seller_trust_stats：增加 p_dispute_days，默认 90
CREATE OR REPLACE FUNCTION get_seller_trust_stats(
  p_seller_id UUID,
  p_dispute_days INT DEFAULT 90
)
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
     WHERE d.created_at >= (NOW() - (LEAST(GREATEST(p_dispute_days, 1), 730) || ' days')::INTERVAL));
$$;

COMMENT ON FUNCTION get_seller_trust_stats(UUID, INT) IS 'Phase 2 trust judgment: seller completed orders and disputes in last p_dispute_days (default 90). Aggregates only.';

-- 2. get_product_price_range：增加 p_days，默认 365
CREATE OR REPLACE FUNCTION get_product_price_range(
  p_product_id UUID,
  p_days INT DEFAULT 365
)
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
    AND o.created_at >= (NOW() - (LEAST(GREATEST(p_days, 1), 730) || ' days')::INTERVAL);
$$;

COMMENT ON FUNCTION get_product_price_range(UUID, INT) IS 'Phase 2 trust judgment: min/max unit_price and count of completed orders for product in last p_days (default 365).';
