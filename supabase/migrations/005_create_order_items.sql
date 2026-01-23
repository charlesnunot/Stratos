-- 创建 order_items 表以支持一个订单包含多个商品

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- 添加 RLS 策略
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己订单的商品
CREATE POLICY "Users can view their own order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.buyer_id = auth.uid()
    )
  );

-- 卖家可以查看自己商品的订单项
CREATE POLICY "Sellers can view order items for their products"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = order_items.product_id
      AND products.seller_id = auth.uid()
    )
  );

-- 系统可以插入订单项（通过 service role）
-- 注意：实际插入应该通过 API 路由使用 service_role_key
