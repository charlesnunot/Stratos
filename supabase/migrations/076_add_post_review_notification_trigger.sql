-- 创建帖子审核状态变更通知触发器
-- 当帖子审核状态从 'pending' 变为 'approved' 或 'rejected' 时，自动通知帖子作者
-- 重要：此迁移依赖于迁移：
--   - 019_add_notification_link_field.sql
--   - 023_add_notification_actor_id.sql
-- 请确保先执行这些迁移，再执行此迁移

-- 创建帖子审核通知触发器函数
CREATE OR REPLACE FUNCTION create_post_review_notification()
RETURNS TRIGGER AS $$
DECLARE
  reviewer_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
BEGIN
  -- 只在状态从 'pending' 变为 'approved' 或 'rejected' 时发送通知
  IF OLD.status != 'pending' OR (NEW.status != 'approved' AND NEW.status != 'rejected') THEN
    RETURN NEW;
  END IF;

  -- 避免给自己审核时发送通知（虽然通常不会发生）
  IF NEW.user_id = NEW.reviewed_by THEN
    RETURN NEW;
  END IF;

  -- 获取审核者信息
  IF NEW.reviewed_by IS NOT NULL THEN
    SELECT display_name, username INTO reviewer_profile
    FROM profiles
    WHERE id = NEW.reviewed_by;
  END IF;

  -- 设置通知内容
  IF NEW.status = 'approved' THEN
    notification_title := '您的帖子已通过审核';
    notification_content := '您的帖子已通过审核，现在可以在平台上看到';
  ELSE
    notification_title := '您的帖子未通过审核';
    notification_content := '很抱歉，您的帖子未通过审核';
  END IF;

  notification_link := '/post/' || NEW.id::TEXT;

  -- 创建通知给帖子作者
  BEGIN
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
      NEW.user_id,
      'system',
      notification_title,
      notification_content,
      NEW.id::UUID,
      'post',
      notification_link,
      NEW.reviewed_by
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'create_post_review_notification: Failed to insert notification for post_id: %, user_id: %, error: %', 
        NEW.id, NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_post_review_notification ON posts;
CREATE TRIGGER trigger_create_post_review_notification
  AFTER UPDATE ON posts
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND (NEW.status = 'approved' OR NEW.status = 'rejected'))
  EXECUTE FUNCTION create_post_review_notification();

-- 验证触发器存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_create_post_review_notification' 
    AND tgrelid = 'posts'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_create_post_review_notification was not created';
  END IF;
  
  RAISE NOTICE 'Trigger trigger_create_post_review_notification verified: exists and enabled';
END $$;

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'create_post_review_notification';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function create_post_review_notification does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function create_post_review_notification verified: SECURITY DEFINER = %', has_security_definer;
END $$;
