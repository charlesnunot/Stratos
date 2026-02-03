-- 话题翻译：与帖子 content_lang / content_translated 一致，支持中英
-- name 为原文（提取时与帖子语言一致），name_translated 为另一种语言的译文；name_lang 标记 name 的语言
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS name_translated TEXT,
  ADD COLUMN IF NOT EXISTS name_lang TEXT CHECK (name_lang IN ('zh', 'en'));

COMMENT ON COLUMN topics.name_translated IS 'AI-translated topic name in the other language';
COMMENT ON COLUMN topics.name_lang IS 'Language of name: zh or en (same as post content_lang when extracted)';
