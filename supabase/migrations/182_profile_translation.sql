-- 用户资料翻译：审核通过后根据 display_name、bio 检测语言并写入译文，供多语言展示

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS content_lang TEXT CHECK (content_lang IN ('zh', 'en')),
  ADD COLUMN IF NOT EXISTS display_name_translated TEXT,
  ADD COLUMN IF NOT EXISTS bio_translated TEXT;

COMMENT ON COLUMN profiles.content_lang IS '资料主语言（display_name/bio），用于展示时选择原文或译文';
COMMENT ON COLUMN profiles.display_name_translated IS '显示名称的译文（与 content_lang 相对的语言）';
COMMENT ON COLUMN profiles.bio_translated IS '简介的译文（与 content_lang 相对的语言）';
