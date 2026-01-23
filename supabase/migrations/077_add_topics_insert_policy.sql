-- 添加 topics 表的 INSERT RLS 策略
-- 允许已认证用户创建新话题
-- 修复发布帖子时创建新话题失败的问题

-- 策略：已认证用户可以创建新话题
DROP POLICY IF EXISTS "Authenticated users can create topics" ON topics;
CREATE POLICY "Authenticated users can create topics" ON topics
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 验证策略已创建
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'topics' 
    AND policyname = 'Authenticated users can create topics'
  ) THEN
    RAISE EXCEPTION 'Policy "Authenticated users can create topics" was not created';
  END IF;
  
  RAISE NOTICE 'Policy "Authenticated users can create topics" verified: exists and enabled';
END $$;
