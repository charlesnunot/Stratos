-- 为 orders 表添加 payment_intent_id 字段以支持 Stripe 支付关联

-- 添加 payment_intent_id 字段
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent_id ON orders(payment_intent_id);

-- 添加注释
COMMENT ON COLUMN orders.payment_intent_id IS 'Stripe payment intent ID for tracking payments';
