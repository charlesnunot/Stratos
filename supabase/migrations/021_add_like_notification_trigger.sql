-- 创建点赞通知触发器
-- 当用户点赞帖子时，自动创建通知发送给帖子作者
-- 重要：此迁移依赖于迁移 019_add_notification_link_field.sql
-- 请确保先执行 019 添加 link 列，再执行此迁移

-- 创建点赞通知触发器函数
CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
  liker_profile RECORD;
BEGIN
  -- 获取帖子作者 ID
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- 避免给自己点赞时发送通知
  IF post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- 获取点赞者信息
  SELECT display_name, username INTO liker_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 创建点赞通知
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
    post_author_id,
    'like',
    '您的帖子收到点赞',
    COALESCE(liker_profile.display_name, liker_profile.username, '某用户') || ' 点赞了您的帖子',
    NEW.post_id,
    'post',
    '/post/' || NEW.post_id::text,
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_like_notification ON likes;
CREATE TRIGGER trigger_create_like_notification
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION create_like_notification();
