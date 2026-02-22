-- Add condition column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS condition TEXT
CHECK (condition IS NULL OR condition IN ('new', 'like_new', 'ninety_five', 'ninety', 'eighty', 'seventy_or_below'));

COMMENT ON COLUMN products.condition IS '商品成色：new/like_new/ninety_five/ninety/eighty/seventy_or_below';