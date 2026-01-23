-- 添加 post_topics 表的 RLS 策略
-- 允许查看和创建帖子与话题的关联关系
-- 修复发布帖子时关联话题失败的问题

-- SELECT 策略：允许所有人查看关联关系
DROP POLICY IF EXISTS "Anyone can view post topics" ON post_topics;
CREATE POLICY "Anyone can view post topics" ON post_topics
  FOR SELECT
  USING (true);

-- INSERT 策略：允许已认证用户关联自己的帖子到话题
DROP POLICY IF EXISTS "Users can link their own posts to topics" ON post_topics;
CREATE POLICY "Users can link their own posts to topics" ON post_topics
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM posts 
      WHERE id = post_id 
      AND user_id = auth.uid()
    )
  );

-- 验证策略已创建
DO $$
BEGIN
  -- 验证 SELECT 策略
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'post_topics' 
    AND policyname = 'Anyone can view post topics'
  ) THEN
    RAISE EXCEPTION 'Policy "Anyone can view post topics" was not created';
  END IF;
  
  -- 验证 INSERT 策略
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'post_topics' 
    AND policyname = 'Users can link their own posts to topics'
  ) THEN
    RAISE EXCEPTION 'Policy "Users can link their own posts to topics" was not created';
  END IF;
  
  RAISE NOTICE 'Post topics RLS policies verified: SELECT and INSERT policies exist and enabled';
END $$;
