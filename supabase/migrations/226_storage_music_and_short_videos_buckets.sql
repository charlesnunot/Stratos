-- 音乐与短视频专用 Storage Bucket 与 RLS
-- 路径约定：{userId}/{timestamp}-{random}.{ext}，第一段为用户 ID

-- 1) 创建 Bucket（若已存在则跳过）
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('music', 'music', true, 20971520),
  ('short-videos', 'short-videos', true, 104857600)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- 2) music bucket RLS
DROP POLICY IF EXISTS "music_insert_own" ON storage.objects;
CREATE POLICY "music_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'music' AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "music_select_all" ON storage.objects;
CREATE POLICY "music_select_all"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'music');

DROP POLICY IF EXISTS "music_update_own" ON storage.objects;
CREATE POLICY "music_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'music' AND (storage.foldername(name))[1] = (auth.uid())::text)
WITH CHECK (bucket_id = 'music' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "music_delete_own" ON storage.objects;
CREATE POLICY "music_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'music' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- 3) short-videos bucket RLS
DROP POLICY IF EXISTS "short_videos_insert_own" ON storage.objects;
CREATE POLICY "short_videos_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'short-videos' AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "short_videos_select_all" ON storage.objects;
CREATE POLICY "short_videos_select_all"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'short-videos');

DROP POLICY IF EXISTS "short_videos_update_own" ON storage.objects;
CREATE POLICY "short_videos_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'short-videos' AND (storage.foldername(name))[1] = (auth.uid())::text)
WITH CHECK (bucket_id = 'short-videos' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "short_videos_delete_own" ON storage.objects;
CREATE POLICY "short_videos_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'short-videos' AND (storage.foldername(name))[1] = (auth.uid())::text);
