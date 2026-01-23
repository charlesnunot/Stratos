-- 创建评论通知触发器
-- 当用户评论帖子时，自动创建通知发送给帖子作者
-- 当用户回复评论时，自动创建通知发送给被回复的评论作者
-- 重要：此迁移依赖于迁移 019_add_notification_link_field.sql 和 023_add_notification_actor_id.sql

-- 创建评论通知触发器函数
CREATE OR REPLACE FUNCTION create_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
  parent_comment_author_id UUID;
  commenter_profile RECORD;
  notification_user_id UUID;
  notification_title TEXT;
  notification_content TEXT;
BEGIN
  -- 获取帖子作者 ID
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- 获取评论者信息
  SELECT display_name, username INTO commenter_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 判断是回复还是直接评论
  IF NEW.parent_id IS NOT NULL THEN
    -- 这是回复评论的情况
    -- 获取被回复的评论作者 ID
    SELECT user_id INTO parent_comment_author_id
    FROM comments
    WHERE id = NEW.parent_id;

    -- 如果被回复的评论不存在或已被删除，直接返回
    IF parent_comment_author_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- 避免给自己回复时发送通知
    IF parent_comment_author_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- 如果被回复的评论作者就是帖子作者，不发送回复通知（避免重复，因为已经有评论通知）
    IF parent_comment_author_id = post_author_id THEN
      RETURN NEW;
    END IF;

    -- 发送回复通知给被回复的评论作者
    notification_user_id := parent_comment_author_id;
    notification_title := '您的评论收到回复';
    notification_content := COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户') || ' 回复了您的评论';
  ELSE
    -- 这是直接评论帖子的情况
    -- 避免给自己评论时发送通知
    IF post_author_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- 发送评论通知给帖子作者
    notification_user_id := post_author_id;
    notification_title := '您的帖子收到评论';
    notification_content := COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户') || ' 评论了您的帖子';
  END IF;

  -- 创建通知
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
    notification_user_id,
    'comment',
    notification_title,
    notification_content,
    NEW.post_id,
    'post',
    '/post/' || NEW.post_id::text,
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_comment_notification ON comments;
CREATE TRIGGER trigger_create_comment_notification
  AFTER INSERT ON comments
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION create_comment_notification();
