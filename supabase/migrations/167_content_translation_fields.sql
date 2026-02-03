-- 仅中英双语：发布时自动翻译，存原文 + 译文
-- posts: 原文 content，译文 content_translated，原文语言 content_lang
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS content_lang TEXT CHECK (content_lang IN ('zh', 'en')),
  ADD COLUMN IF NOT EXISTS content_translated TEXT;

-- comments
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS content_lang TEXT CHECK (content_lang IN ('zh', 'en')),
  ADD COLUMN IF NOT EXISTS content_translated TEXT;

-- products: 原文 name/description，译文 name_translated/description_translated
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS content_lang TEXT CHECK (content_lang IN ('zh', 'en')),
  ADD COLUMN IF NOT EXISTS name_translated TEXT,
  ADD COLUMN IF NOT EXISTS description_translated TEXT;

COMMENT ON COLUMN posts.content_lang IS 'Author language: zh or en';
COMMENT ON COLUMN posts.content_translated IS 'AI-translated content in the other language';
COMMENT ON COLUMN comments.content_lang IS 'Author language: zh or en';
COMMENT ON COLUMN comments.content_translated IS 'AI-translated content in the other language';
COMMENT ON COLUMN products.content_lang IS 'Author language: zh or en';
COMMENT ON COLUMN products.name_translated IS 'AI-translated product name';
COMMENT ON COLUMN products.description_translated IS 'AI-translated product description';
