-- 修复 RLS 权限问题：授予 anon 和 authenticated 角色访问 public schema 的权限

-- 授予 schema 使用权限
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 授予所有表的 SELECT、INSERT、UPDATE、DELETE 权限（RLS 策略会进一步控制访问）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- 授予未来创建的表自动获得权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;

-- 授予序列的使用权限（用于自增 ID）
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 授予未来创建的序列自动获得权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

-- 确保 profiles 表的 SELECT 策略允许所有人查看（包括未登录用户）
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT
  USING (true);

-- 确保 posts 表的 SELECT 策略允许查看已审核的帖子（包括未登录用户）
DROP POLICY IF EXISTS "Users can view approved posts" ON posts;
CREATE POLICY "Users can view approved posts" ON posts
  FOR SELECT
  USING (status = 'approved' OR user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'support')
  ));

-- 确保 topics 表的 SELECT 策略允许所有人查看
DROP POLICY IF EXISTS "Users can view all topics" ON topics;
CREATE POLICY "Users can view all topics" ON topics
  FOR SELECT
  USING (true);
