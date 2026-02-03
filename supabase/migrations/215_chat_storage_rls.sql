-- Chat message images storage bucket RLS
-- Path format: chat/${user.id}/${timestamp}-random.ext
--
-- Create bucket "chat" in Supabase Dashboard (Storage -> New bucket):
-- Name: chat, Public: true, Size limit: 5MB, MIME: image/jpeg, image/png, image/gif, image/webp
--
-- Then add Storage RLS policies for bucket_id = 'chat':
-- 1. INSERT: authenticated, (storage.foldername(name))[1] = 'chat' AND (storage.foldername(name))[2] = (auth.uid())::text
-- 2. SELECT: public (everyone can view)

CREATE POLICY "Users can upload to own chat folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat' AND
  (storage.foldername(name))[1] = 'chat' AND
  (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Anyone can view chat images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat');
