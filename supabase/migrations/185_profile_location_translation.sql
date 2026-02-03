-- 资料位置翻译：与 display_name/bio 一致，审核通过后翻译 location 写入 location_translated，供多语言展示

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_translated TEXT;

COMMENT ON COLUMN profiles.location_translated IS '位置的译文（与 content_lang 相对的语言）';
