-- 商品分类译文：分类为 AI 自动生成（非硬编码），审核通过时翻译，便于多语言展示与筛选扩展
-- products.category 存原文（如「数码」），category_translated 存译文（如 "Electronics"）

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_translated TEXT;

COMMENT ON COLUMN products.category_translated IS 'AI-translated category label; category is AI-suggested free text, not a fixed enum';
