-- 用户资料审核：用户提交的修改写入 pending_*，审核通过后才写入主字段；未审核的资料仅本人可见

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_status TEXT DEFAULT 'approved' CHECK (profile_status IN ('pending', 'approved')),
  ADD COLUMN IF NOT EXISTS pending_display_name TEXT,
  ADD COLUMN IF NOT EXISTS pending_username TEXT,
  ADD COLUMN IF NOT EXISTS pending_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS pending_bio TEXT,
  ADD COLUMN IF NOT EXISTS pending_location TEXT;

COMMENT ON COLUMN profiles.profile_status IS 'pending=待审核, approved=已通过；仅本人可见 pending 内容';
COMMENT ON COLUMN profiles.pending_display_name IS '待审核的显示名称，审核通过后写入 display_name';
COMMENT ON COLUMN profiles.pending_username IS '待审核的用户名，审核通过后写入 username';
COMMENT ON COLUMN profiles.pending_avatar_url IS '待审核的头像，审核通过后写入 avatar_url';
COMMENT ON COLUMN profiles.pending_bio IS '待审核的简介，审核通过后写入 bio';
COMMENT ON COLUMN profiles.pending_location IS '待审核的位置，审核通过后写入 location';
