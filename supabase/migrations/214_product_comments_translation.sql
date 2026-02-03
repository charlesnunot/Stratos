-- 商品讨论（product_comments）与帖子评论一致：审核通过后自动翻译，需 content_lang / content_translated
ALTER TABLE public.product_comments
  ADD COLUMN IF NOT EXISTS content_lang TEXT CHECK (content_lang IN ('zh', 'en')),
  ADD COLUMN IF NOT EXISTS content_translated TEXT;

COMMENT ON COLUMN public.product_comments.content_lang IS 'Author language: zh or en';
COMMENT ON COLUMN public.product_comments.content_translated IS 'AI-translated content in the other language';
