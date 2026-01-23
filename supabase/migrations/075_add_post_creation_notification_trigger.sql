-- 创建帖子通知触发器
-- 当用户创建新帖子时，自动通知所有管理员和 support 角色用户进行审核
-- 重要：此迁移依赖于迁移：
--   - 019_add_notification_link_field.sql
--   - 023_add_notification_actor_id.sql
-- 请确保先执行这些迁移，再执行此迁移

-- 创建帖子通知触发器函数
CREATE OR REPLACE FUNCTION create_post_creation_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_profile RECORD;
  admin_user RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  post_preview TEXT;
BEGIN
  -- 只在帖子状态为 'pending' 时发送通知
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- 获取帖子作者信息
  SELECT display_name, username INTO post_author_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 如果作者信息未找到，记录警告但继续处理
  IF post_author_profile IS NULL THEN
    RAISE WARNING 'create_post_creation_notification: Post author profile not found for user_id: %', NEW.user_id;
  END IF;

  -- 生成帖子预览（截取前50个字符）
  IF NEW.content IS NOT NULL AND LENGTH(NEW.content) > 0 THEN
    IF LENGTH(NEW.content) > 50 THEN
      post_preview := LEFT(NEW.content, 50) || '...';
    ELSE
      post_preview := NEW.content;
    END IF;
  ELSE
    post_preview := '[图片帖子]';
  END IF;

  notification_title := '收到新的待审核帖子';
  notification_content := COALESCE(post_author_profile.display_name, post_author_profile.username, '某用户') || ' 发布了新帖子：' || post_preview;
  notification_link := '/admin/review';

  -- 为所有管理员和 support 角色用户创建通知
  FOR admin_user IN 
    SELECT id FROM profiles
    WHERE role IN ('admin', 'support')
  LOOP
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
        admin_user.id,
        'system',
        notification_title,
        notification_content,
        NEW.id::UUID,
        'post',
        notification_link,
        NEW.user_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'create_post_creation_notification: Failed to insert notification for admin user_id: %, error: %', 
          admin_user.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_post_creation_notification ON posts;
CREATE TRIGGER trigger_create_post_creation_notification
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION create_post_creation_notification();

-- 验证触发器存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_create_post_creation_notification' 
    AND tgrelid = 'posts'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_create_post_creation_notification was not created';
  END IF;
  
  RAISE NOTICE 'Trigger trigger_create_post_creation_notification verified: exists and enabled';
END $$;

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'create_post_creation_notification';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function create_post_creation_notification does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function create_post_creation_notification verified: SECURITY DEFINER = %', has_security_definer;
END $$;
