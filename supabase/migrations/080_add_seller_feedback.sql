-- 创建卖家反馈表
-- 用于存储买家对卖家的评价，包括三个维度的评分：配送时间、产品质量、客户服务

CREATE TABLE seller_feedbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  shipping_time_rating INT CHECK (shipping_time_rating >= 1 AND shipping_time_rating <= 5),
  product_quality_rating INT CHECK (product_quality_rating >= 1 AND product_quality_rating <= 5),
  customer_service_rating INT CHECK (customer_service_rating >= 1 AND customer_service_rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, buyer_id) -- 每个订单只能评价一次
);

-- 创建索引
CREATE INDEX idx_seller_feedbacks_seller_id ON seller_feedbacks(seller_id);
CREATE INDEX idx_seller_feedbacks_order_id ON seller_feedbacks(order_id);
CREATE INDEX idx_seller_feedbacks_buyer_id ON seller_feedbacks(buyer_id);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_seller_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_seller_feedback_updated_at
  BEFORE UPDATE ON seller_feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_feedback_updated_at();
