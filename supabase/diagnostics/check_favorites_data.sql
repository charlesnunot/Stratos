-- 诊断脚本：检查favorites表中的帖子收藏数据
-- 用于诊断帖子特别关注功能是否正常工作

-- 1. 检查所有帖子收藏记录
SELECT 
  id,
  user_id,
  item_type,
  item_id,
  created_at,
  (SELECT username FROM profiles WHERE id = favorites.user_id) as user_username,
  (SELECT content FROM posts WHERE id = favorites.item_id::UUID LIMIT 1) as post_content_preview
FROM favorites 
WHERE item_type = 'post' 
ORDER BY created_at DESC 
LIMIT 20;

-- 2. 统计各类型的收藏数量
SELECT 
  item_type,
  COUNT(*) as count
FROM favorites
GROUP BY item_type
ORDER BY count DESC;

-- 3. 检查特定用户的收藏（替换 'USER_ID_HERE' 为实际用户ID）
-- SELECT * FROM favorites 
-- WHERE user_id = 'USER_ID_HERE' 
-- AND item_type = 'post'
-- ORDER BY created_at DESC;

-- 4. 检查最近的收藏操作
SELECT 
  id,
  user_id,
  item_type,
  item_id,
  created_at
FROM favorites
ORDER BY created_at DESC
LIMIT 10;

-- 5. 验证RLS策略：检查当前认证用户可以看到的收藏
-- 注意：此查询需要在有认证上下文中执行
-- SELECT * FROM favorites 
-- WHERE item_type = 'post'
-- ORDER BY created_at DESC;
