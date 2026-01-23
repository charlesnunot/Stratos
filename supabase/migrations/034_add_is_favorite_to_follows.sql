-- 在follows表中添加is_favorite字段，用于区分普通关注和特别关注
-- 将favorites表中item_type='user'的记录迁移到follows表

-- 1. 添加 is_favorite 字段
ALTER TABLE follows 
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false NOT NULL;

-- 2. 创建索引以提高查询性能（只索引is_favorite=true的记录）
CREATE INDEX IF NOT EXISTS idx_follows_is_favorite ON follows(is_favorite) WHERE is_favorite = true;

-- 3. 数据迁移：将 favorites 表中的用户收藏转换为 follows 记录
-- 对于每个 favorites 表中 item_type = 'user' 的记录：
--   - 如果该用户已在 follows 表中，更新 is_favorite = true
--   - 如果该用户不在 follows 表中，插入新记录并设置 is_favorite = true

-- 首先，更新已存在的关注关系
UPDATE follows f
SET is_favorite = true
FROM favorites fav
WHERE f.follower_id = fav.user_id
  AND f.followee_id = fav.item_id::UUID
  AND fav.item_type = 'user'
  AND f.is_favorite = false;

-- 然后，插入新的关注关系（对于在favorites中但不在follows中的用户）
INSERT INTO follows (follower_id, followee_id, is_favorite, created_at)
SELECT 
  fav.user_id,
  fav.item_id::UUID,
  true,
  COALESCE(fav.created_at, NOW())
FROM favorites fav
WHERE fav.item_type = 'user'
  AND NOT EXISTS (
    SELECT 1 
    FROM follows f 
    WHERE f.follower_id = fav.user_id 
      AND f.followee_id = fav.item_id::UUID
  )
ON CONFLICT (follower_id, followee_id) DO NOTHING;

-- 4. 验证迁移结果（可选，用于检查）
-- SELECT 
--   (SELECT COUNT(*) FROM favorites WHERE item_type = 'user') as favorites_user_count,
--   (SELECT COUNT(*) FROM follows WHERE is_favorite = true) as follows_favorite_count;
