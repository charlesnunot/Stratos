-- 添加转发功能支持
-- 1. 在posts表中添加转发相关字段
-- 2. 创建reposts表记录转发关系
-- 3. 添加转发通知支持
-- 4. 创建转发计数触发器

-- 1. 添加转发计数字段到posts表（不需要original_post_id字段，因为转发不在posts表中创建新记录）
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS repost_count INT DEFAULT 0;

-- 2. 处理可能存在的旧版本reposts表
-- 如果表已存在但缺少新字段（item_type），说明是旧版本，需要删除重建
DO $$ 
BEGIN
  -- 检查表是否存在且缺少item_type字段
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'reposts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'reposts' 
      AND column_name = 'item_type'
  ) THEN
    -- 旧表存在，删除相关对象
    DROP TRIGGER IF EXISTS trigger_update_repost_count ON reposts;
    DROP TRIGGER IF EXISTS trigger_create_repost_notification ON reposts;
    DROP TABLE IF EXISTS reposts CASCADE;
  END IF;
END $$;

-- 3. 创建reposts表记录转发关系（支持转发时添加评论）
-- 支持转发帖子和商品
CREATE TABLE IF NOT EXISTS reposts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'product')), -- 转发类型
  original_item_id UUID NOT NULL, -- 原帖或商品ID
  target_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- 转发目标用户
  repost_content TEXT, -- 转发时添加的评论（可选）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_type, original_item_id, target_user_id)
);

-- 添加外键约束（根据item_type）
-- 注意：PostgreSQL不支持条件外键，所以我们需要在应用层或触发器层处理

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON reposts(user_id);
CREATE INDEX IF NOT EXISTS idx_reposts_item_type_id ON reposts(item_type, original_item_id);
CREATE INDEX IF NOT EXISTS idx_reposts_target_user_id ON reposts(target_user_id);
CREATE INDEX IF NOT EXISTS idx_reposts_created_at ON reposts(created_at DESC);

-- 4. 更新notifications表的type约束，添加'repost'类型
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('like', 'comment', 'follow', 'order', 'commission', 'system', 'report', 'favorite', 'repost', 'share'));

-- 5. 为products表添加repost_count字段
ALTER TABLE products
ADD COLUMN IF NOT EXISTS repost_count INT DEFAULT 0;

-- 6. 删除可能存在的旧版本函数（确保可以重新创建）
DROP FUNCTION IF EXISTS update_repost_count() CASCADE;
DROP FUNCTION IF EXISTS create_repost_notification() CASCADE;

-- 7. 创建转发计数更新触发器函数
CREATE OR REPLACE FUNCTION update_repost_count()
RETURNS TRIGGER AS $$
DECLARE
  unique_repost_count INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 统计有多少个不同的用户转发了这个项目（不按目标用户统计）
    SELECT COUNT(DISTINCT user_id) INTO unique_repost_count
    FROM reposts
    WHERE item_type = NEW.item_type
      AND original_item_id = NEW.original_item_id;
    
    -- 根据item_type更新对应的计数
    IF NEW.item_type = 'post' THEN
      UPDATE posts
      SET repost_count = unique_repost_count
      WHERE id = NEW.original_item_id::UUID;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE products
      SET repost_count = unique_repost_count
      WHERE id = NEW.original_item_id::UUID;
    END IF;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- 统计有多少个不同的用户转发了这个项目
    SELECT COUNT(DISTINCT user_id) INTO unique_repost_count
    FROM reposts
    WHERE item_type = OLD.item_type
      AND original_item_id = OLD.original_item_id;
    
    -- 根据item_type更新对应的计数
    IF OLD.item_type = 'post' THEN
      UPDATE posts
      SET repost_count = GREATEST(unique_repost_count, 0)
      WHERE id = OLD.original_item_id::UUID;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE products
      SET repost_count = GREATEST(unique_repost_count, 0)
      WHERE id = OLD.original_item_id::UUID;
    END IF;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_update_repost_count ON reposts;
CREATE TRIGGER trigger_update_repost_count
  AFTER INSERT OR DELETE ON reposts
  FOR EACH ROW
  EXECUTE FUNCTION update_repost_count();

-- 7. 创建转发通知触发器函数
CREATE OR REPLACE FUNCTION create_repost_notification()
RETURNS TRIGGER AS $$
DECLARE
  reposter_profile RECORD;
  original_post_user_id UUID;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  repost_comment TEXT;
  truncated_comment TEXT;
BEGIN
  -- 只在插入时发送通知
  IF TG_OP = 'INSERT' THEN
    -- 获取原项目作者ID
    IF NEW.item_type = 'post' THEN
      SELECT user_id INTO original_post_user_id FROM posts WHERE id = NEW.original_item_id::UUID;
    ELSIF NEW.item_type = 'product' THEN
      SELECT seller_id INTO original_post_user_id FROM products WHERE id = NEW.original_item_id::UUID;
    END IF;
    
    -- 获取转发者信息
    SELECT display_name, username INTO reposter_profile
    FROM profiles
    WHERE id = NEW.user_id;
    
    -- 处理转发评论（如果有），限制长度为100字符
    IF NEW.repost_content IS NOT NULL AND LENGTH(TRIM(NEW.repost_content)) > 0 THEN
      repost_comment := TRIM(NEW.repost_content);
      IF LENGTH(repost_comment) > 100 THEN
        truncated_comment := LEFT(repost_comment, 100) || '...';
      ELSE
        truncated_comment := repost_comment;
      END IF;
    ELSE
      truncated_comment := NULL;
    END IF;
    
    -- 构建通知链接
    IF NEW.item_type = 'post' THEN
      notification_link := '/post/' || NEW.original_item_id::TEXT;
    ELSIF NEW.item_type = 'product' THEN
      notification_link := '/product/' || NEW.original_item_id::TEXT;
    END IF;
    
    -- 1. 给目标用户发送通知（转发给目标用户）
    IF NEW.target_user_id IS NOT NULL AND NEW.user_id != NEW.target_user_id THEN
      notification_title := '您有一条转发';
      IF NEW.item_type = 'post' THEN
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 向您转发了帖子';
      ELSE
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 向您转发了商品';
      END IF;
      
      -- 如果有转发评论，追加到通知内容中
      IF truncated_comment IS NOT NULL THEN
        notification_content := notification_content || '：' || truncated_comment;
      END IF;
      
      INSERT INTO notifications (
        user_id,
        type,
        title,
        content,
        related_id,
        related_type,
        link,
        actor_id
      )
      VALUES (
        NEW.target_user_id,
        'repost',
        notification_title,
        notification_content,
        NEW.original_item_id::UUID,
        NEW.item_type,
        notification_link,
        NEW.user_id
      );
    END IF;
    
    -- 2. 给原项目作者发送通知（有人转发了他的内容）
    IF original_post_user_id IS NOT NULL 
       AND NEW.user_id != original_post_user_id 
       AND (NEW.target_user_id IS NULL OR NEW.target_user_id != original_post_user_id) THEN
      notification_title := '您有一条转发';
      IF NEW.item_type = 'post' THEN
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 转发了您的帖子';
      ELSE
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 转发了您的商品';
      END IF;
      
      -- 如果有转发评论，追加到通知内容中
      IF truncated_comment IS NOT NULL THEN
        notification_content := notification_content || '：' || truncated_comment;
      END IF;
      
      INSERT INTO notifications (
        user_id,
        type,
        title,
        content,
        related_id,
        related_type,
        link,
        actor_id
      )
      VALUES (
        original_post_user_id,
        'repost',
        notification_title,
        notification_content,
        NEW.original_item_id::UUID,
        NEW.item_type,
        notification_link,
        NEW.user_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建转发通知触发器
DROP TRIGGER IF EXISTS trigger_create_repost_notification ON reposts;
CREATE TRIGGER trigger_create_repost_notification
  AFTER INSERT ON reposts
  FOR EACH ROW
  EXECUTE FUNCTION create_repost_notification();

-- 8. 启用RLS
ALTER TABLE reposts ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略（如果存在）
DROP POLICY IF EXISTS "Users can view all reposts" ON reposts;
DROP POLICY IF EXISTS "Users can create their own reposts" ON reposts;
DROP POLICY IF EXISTS "Users can delete their own reposts" ON reposts;

-- RLS策略：用户可以查看所有转发
CREATE POLICY "Users can view all reposts"
  ON reposts FOR SELECT
  USING (true);

-- RLS策略：用户可以创建自己的转发
CREATE POLICY "Users can create their own reposts"
  ON reposts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS策略：用户可以删除自己的转发
CREATE POLICY "Users can delete their own reposts"
  ON reposts FOR DELETE
  USING (auth.uid() = user_id);
