-- 更新通知触发器：监听follows表的is_favorite字段变化
-- 当用户将其他用户添加到特别关注时，发送通知

-- 创建或替换特别关注通知触发器函数
CREATE OR REPLACE FUNCTION create_favorite_user_notification()
RETURNS TRIGGER AS $$
DECLARE
  favoriter_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
BEGIN
  -- 只在 is_favorite 从 false 变为 true 时发送通知
  IF NEW.is_favorite = true AND (OLD.is_favorite IS NULL OR OLD.is_favorite = false) THEN
    -- 避免给自己特别关注时发送通知
    IF NEW.follower_id = NEW.followee_id THEN
      RETURN NEW;
    END IF;

    -- 获取收藏者信息
    SELECT display_name, username INTO favoriter_profile
    FROM profiles
    WHERE id = NEW.follower_id;

    notification_title := '您被添加到特别关注';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 将您添加到了特别关注';
    notification_link := '/profile/' || NEW.follower_id::TEXT;

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
      NEW.followee_id,
      'favorite',
      notification_title,
      notification_content,
      NEW.follower_id,
      'user',
      notification_link,
      NEW.follower_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除旧的触发器（如果存在）
DROP TRIGGER IF EXISTS trigger_create_favorite_user_notification ON follows;

-- 创建新的触发器
CREATE TRIGGER trigger_create_favorite_user_notification
  AFTER INSERT OR UPDATE OF is_favorite ON follows
  FOR EACH ROW
  EXECUTE FUNCTION create_favorite_user_notification();
