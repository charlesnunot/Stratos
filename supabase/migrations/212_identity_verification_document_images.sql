-- Add document image paths to identity_verifications (stored in storage bucket identity-docs)
ALTER TABLE identity_verifications
  ADD COLUMN IF NOT EXISTS id_card_front_path TEXT,
  ADD COLUMN IF NOT EXISTS id_card_back_path TEXT;

COMMENT ON COLUMN identity_verifications.id_card_front_path IS 'Storage path for ID card front image, e.g. {user_id}/front-{ts}.jpg';
COMMENT ON COLUMN identity_verifications.id_card_back_path IS 'Storage path for ID card back image, e.g. {user_id}/back-{ts}.jpg';

-- Storage bucket "identity-docs" 需在 Supabase Dashboard 中手动创建（建议设为 private）：
-- 1. Storage -> New bucket -> Name: identity-docs, Private: 是
-- 2. Policies: 允许 authenticated 用户 INSERT/SELECT 当 (storage.foldername(name))[1] = auth.uid()::text
--    即用户只能上传/读取自己目录下的文件（路径格式：{user_id}/front-xxx.jpg）
-- 管理员通过 service role 使用 createSignedUrl 生成临时链接查看证件图。
