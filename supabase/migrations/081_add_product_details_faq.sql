-- 扩展 products 表：添加商品详情和 FAQ 字段
-- 扩展 profiles 表：添加卖家政策字段

-- 添加商品详情字段
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS details TEXT, -- 详细商品信息（颜色、尺寸、材质等）
ADD COLUMN IF NOT EXISTS faq JSONB DEFAULT '[]'; -- FAQ 数组，格式：[{question: string, answer: string}]

-- 添加卖家政策字段到 profiles 表
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS return_policy TEXT, -- 退货政策
ADD COLUMN IF NOT EXISTS exchange_policy TEXT, -- 换货政策
ADD COLUMN IF NOT EXISTS shipping_policy TEXT, -- 配送政策
ADD COLUMN IF NOT EXISTS contact_info TEXT; -- 联系信息

-- 添加注释
COMMENT ON COLUMN products.details IS '商品详细信息，包括颜色、尺寸、材质等';
COMMENT ON COLUMN products.faq IS '商品常见问题，JSONB 格式：[{question: string, answer: string}]';
COMMENT ON COLUMN profiles.return_policy IS '卖家退货政策';
COMMENT ON COLUMN profiles.exchange_policy IS '卖家换货政策';
COMMENT ON COLUMN profiles.shipping_policy IS '卖家配送政策';
COMMENT ON COLUMN profiles.contact_info IS '卖家联系信息';
