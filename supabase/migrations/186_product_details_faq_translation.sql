-- 商品详情与 FAQ 译文：审核通过时自动翻译，与 name/description 一致
-- details: 详细商品信息 → details_translated
-- faq: [{question, answer}] → faq_translated 同结构

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS details_translated TEXT,
  ADD COLUMN IF NOT EXISTS faq_translated JSONB DEFAULT '[]';

COMMENT ON COLUMN products.details_translated IS 'AI-translated product details (colors, size, material, etc.)';
COMMENT ON COLUMN products.faq_translated IS 'AI-translated FAQ array: [{question, answer}] same shape as faq';
