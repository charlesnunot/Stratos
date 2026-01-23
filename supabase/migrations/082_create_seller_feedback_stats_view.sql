-- 创建卖家反馈统计视图
-- 用于快速查询卖家的反馈统计数据

CREATE OR REPLACE VIEW seller_feedback_stats AS
SELECT 
  seller_id,
  COUNT(*) FILTER (WHERE shipping_time_rating IS NOT NULL) as total_ratings,
  ROUND(AVG(shipping_time_rating), 1) as avg_shipping_time_rating,
  ROUND(AVG(product_quality_rating), 1) as avg_product_quality_rating,
  ROUND(AVG(customer_service_rating), 1) as avg_customer_service_rating,
  COUNT(DISTINCT order_id) as total_orders_with_feedback
FROM seller_feedbacks
GROUP BY seller_id;

-- 添加注释
COMMENT ON VIEW seller_feedback_stats IS '卖家反馈统计视图，包含平均评分和评价数量';
