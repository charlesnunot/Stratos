-- Add sizes column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS sizes JSONB DEFAULT '[]';

COMMENT ON COLUMN products.sizes IS '商品尺寸选项，格式：["S", "M", "L"] 或空数组';