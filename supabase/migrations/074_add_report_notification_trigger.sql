-- 创建举报通知触发器
-- 当用户创建举报时，自动通知所有管理员和 support 角色用户
-- 重要：此迁移依赖于迁移：
--   - 019_add_notification_link_field.sql
--   - 023_add_notification_actor_id.sql
--   - 029_add_report_notification_type.sql
-- 请确保先执行这些迁移，再执行此迁移

-- 创建举报通知触发器函数
CREATE OR REPLACE FUNCTION create_report_notification()
RETURNS TRIGGER AS $$
DECLARE
  reporter_profile RECORD;
  admin_user RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  reported_type_label TEXT;
BEGIN
  -- 获取举报者信息
  SELECT display_name, username INTO reporter_profile
  FROM profiles
  WHERE id = NEW.reporter_id;

  -- 如果举报者信息未找到，记录警告但继续处理
  IF reporter_profile IS NULL THEN
    RAISE WARNING 'create_report_notification: Reporter profile not found for user_id: %', NEW.reporter_id;
  END IF;

  -- 根据举报类型设置标签
  reported_type_label := CASE NEW.reported_type
    WHEN 'post' THEN '帖子'
    WHEN 'product' THEN '商品'
    WHEN 'user' THEN '用户'
    WHEN 'comment' THEN '评论'
    WHEN 'order' THEN '订单'
    WHEN 'affiliate_post' THEN '带货帖子'
    WHEN 'tip' THEN '打赏'
    WHEN 'message' THEN '聊天内容'
    ELSE NEW.reported_type
  END;

  notification_title := '收到新的举报';
  notification_content := COALESCE(reporter_profile.display_name, reporter_profile.username, '某用户') || ' 举报了' || reported_type_label || '（' || NEW.reason || '）';
  notification_link := '/admin/reports';

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
        'report',
        notification_title,
        notification_content,
        NEW.id::UUID,
        'report',
        notification_link,
        NEW.reporter_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'create_report_notification: Failed to insert notification for admin user_id: %, error: %', 
          admin_user.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_report_notification ON reports;
CREATE TRIGGER trigger_create_report_notification
  AFTER INSERT ON reports
  FOR EACH ROW
  EXECUTE FUNCTION create_report_notification();

-- 验证触发器存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_create_report_notification' 
    AND tgrelid = 'reports'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_create_report_notification was not created';
  END IF;
  
  RAISE NOTICE 'Trigger trigger_create_report_notification verified: exists and enabled';
END $$;

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'create_report_notification';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function create_report_notification does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function create_report_notification verified: SECURITY DEFINER = %', has_security_definer;
END $$;
