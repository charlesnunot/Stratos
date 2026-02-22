-- products: 商品运费
ALTER TABLE products
ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN products.shipping_fee IS '商品运费，与 price 同单位；同一卖家多商品合并时取 MAX';

-- orders: 订单运费（用于展示）
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN orders.shipping_fee IS '该订单的运费部分，total_amount = 商品小计 + shipping_fee';

-- 兼容旧数据
UPDATE products SET shipping_fee = COALESCE(shipping_fee, 0) WHERE shipping_fee IS NULL;
UPDATE orders SET shipping_fee = COALESCE(shipping_fee, 0) WHERE shipping_fee IS NULL;