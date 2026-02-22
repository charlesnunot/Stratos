-- Migration: Advanced Analytics Functions
-- Description: Create database functions for Scale tier seller analytics
-- Tier: Scale ($100) only

-- 1. 创建函数：获取回头客列表
CREATE OR REPLACE FUNCTION get_repeat_customers(p_seller_id UUID)
RETURNS TABLE (
  buyer_id UUID,
  order_count BIGINT,
  total_spent NUMERIC,
  first_order TIMESTAMPTZ,
  last_order TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.buyer_id,
    COUNT(*)::BIGINT as order_count,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as total_spent,
    MIN(o.created_at) as first_order,
    MAX(o.created_at) as last_order
  FROM orders o
  WHERE o.seller_id = p_seller_id
    AND o.status = 'completed'
  GROUP BY o.buyer_id
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 创建函数：获取商品销售统计
CREATE OR REPLACE FUNCTION get_product_sales_stats(
  p_seller_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  total_sales BIGINT,
  total_revenue NUMERIC,
  avg_price NUMERIC
) AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  v_start_date := NOW() - (p_days || ' days')::INTERVAL;
  
  RETURN QUERY
  SELECT 
    p.id as product_id,
    p.name as product_name,
    COALESCE(COUNT(o.id), 0)::BIGINT as total_sales,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as total_revenue,
    COALESCE(AVG(o.total_amount), 0)::NUMERIC as avg_price
  FROM products p
  LEFT JOIN orders o ON o.product_id = p.id 
    AND o.status = 'completed'
    AND o.created_at >= v_start_date
  WHERE p.seller_id = p_seller_id
  GROUP BY p.id, p.name
  ORDER BY total_sales DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 创建函数：获取每日销售汇总
CREATE OR REPLACE FUNCTION get_daily_sales_summary(
  p_seller_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  sale_date DATE,
  order_count BIGINT,
  total_revenue NUMERIC,
  unique_buyers BIGINT
) AS $$
DECLARE
  v_start_date DATE;
BEGIN
  v_start_date := CURRENT_DATE - p_days;
  
  RETURN QUERY
  SELECT 
    DATE(o.created_at) as sale_date,
    COUNT(*)::BIGINT as order_count,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC as total_revenue,
    COUNT(DISTINCT o.buyer_id)::BIGINT as unique_buyers
  FROM orders o
  WHERE o.seller_id = p_seller_id
    AND o.order_status = 'completed'
    AND DATE(o.created_at) >= v_start_date
  GROUP BY DATE(o.created_at)
  ORDER BY sale_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 创建视图：卖家综合统计
CREATE OR REPLACE VIEW seller_comprehensive_stats AS
SELECT 
  p.id as seller_id,
  p.username as seller_username,
  p.display_name as seller_display_name,
  
  -- 商品统计
  COUNT(DISTINCT prod.id) FILTER (WHERE prod.status = 'active') as active_products,
  COUNT(DISTINCT prod.id) as total_products,
  
  -- 订单统计
  COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'completed') as completed_orders,
  COUNT(DISTINCT o.id) as total_orders,
  
  -- 营收统计
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status = 'completed'), 0) as total_revenue,
  COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_status = 'completed' AND o.created_at >= DATE_TRUNC('month', NOW())), 0) as month_revenue,
  
  -- 客户统计
  COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.order_status = 'completed') as unique_customers,
  
  -- 互动统计
  COALESCE(SUM(prod.like_count), 0) as total_likes,
  COALESCE(SUM(prod.want_count), 0) as total_wants,
  
  -- 订阅信息
  s.subscription_tier,
  s.expires_at as subscription_expires_at

FROM profiles p
LEFT JOIN products prod ON prod.seller_id = p.id
LEFT JOIN orders o ON o.seller_id = p.id
LEFT JOIN subscriptions s ON s.user_id = p.id 
  AND s.subscription_type = 'seller'
  AND s.status = 'active'
WHERE p.role = 'seller'
GROUP BY p.id, p.username, p.display_name, s.subscription_tier, s.expires_at;

-- 5. 添加注释
COMMENT ON FUNCTION get_repeat_customers IS '获取回头客列表 - Scale档位功能';
COMMENT ON FUNCTION get_product_sales_stats IS '获取商品销售统计 - Scale档位功能';
COMMENT ON FUNCTION get_daily_sales_summary IS '获取每日销售汇总 - Scale档位功能';
COMMENT ON VIEW seller_comprehensive_stats IS '卖家综合统计视图 - Scale档位功能';
