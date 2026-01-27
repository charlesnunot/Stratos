-- 添加工单通知触发器
-- 当工单创建、回复、状态变更时，自动创建通知

-- 1. 工单创建通知：通知所有 admin/support 用户
CREATE OR REPLACE FUNCTION create_ticket_creation_notification()
RETURNS TRIGGER AS $$
DECLARE
  admin_user UUID;
  ticket_creator_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
BEGIN
  -- 获取工单创建者信息
  SELECT display_name, username INTO ticket_creator_profile
  FROM profiles
  WHERE id = NEW.user_id;

  notification_title := '新工单创建';
  notification_content := COALESCE(ticket_creator_profile.display_name, ticket_creator_profile.username, '某用户') || 
    ' 创建了一个新工单：' || LEFT(NEW.title, 50);

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
        admin_user,
        'system',
        notification_title,
        notification_content,
        NEW.id,
        'support_ticket',
        '/admin/support',
        NEW.user_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'create_ticket_creation_notification: Failed to insert notification for admin user_id: %, error: %', 
          admin_user, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_ticket_creation_notification ON support_tickets;
CREATE TRIGGER trigger_create_ticket_creation_notification
  AFTER INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_creation_notification();

-- 2. 工单回复通知：通知工单创建者或回复者（如果回复者是 admin/support，通知创建者；如果回复者是创建者，通知被分配的支持人员）
CREATE OR REPLACE FUNCTION create_ticket_reply_notification()
RETURNS TRIGGER AS $$
DECLARE
  ticket_record RECORD;
  reply_user_profile RECORD;
  admin_user UUID;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  target_user_id UUID;
BEGIN
  -- 获取工单信息
  SELECT user_id, assigned_to, status INTO ticket_record
  FROM support_tickets
  WHERE id = NEW.ticket_id;

  IF ticket_record IS NULL THEN
    RETURN NEW;
  END IF;

  -- 获取回复者信息
  SELECT display_name, username INTO reply_user_profile
  FROM profiles
  WHERE id = NEW.user_id;

  notification_link := '/support/tickets/' || NEW.ticket_id::TEXT;

  -- 判断通知目标
  IF NEW.user_id = ticket_record.user_id THEN
    -- 用户回复自己的工单，通知被分配的支持人员（如果有）
    IF ticket_record.assigned_to IS NOT NULL AND ticket_record.assigned_to != NEW.user_id THEN
      target_user_id := ticket_record.assigned_to;
      notification_title := '工单有新回复';
      notification_content := COALESCE(reply_user_profile.display_name, reply_user_profile.username, '用户') || 
        ' 回复了工单：' || (SELECT title FROM support_tickets WHERE id = NEW.ticket_id);
    ELSE
      -- 没有分配的支持人员，通知所有 admin/support
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
            admin_user,
            'system',
            '工单有新回复',
            COALESCE(reply_user_profile.display_name, reply_user_profile.username, '用户') || 
              ' 回复了工单：' || (SELECT title FROM support_tickets WHERE id = NEW.ticket_id),
            NEW.ticket_id,
            'support_ticket',
            notification_link,
            NEW.user_id
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'create_ticket_reply_notification: Failed to insert notification for admin user_id: %, error: %', 
              admin_user, SQLERRM;
        END;
      END LOOP;
      RETURN NEW;
    END IF;
  ELSE
    -- 支持人员回复，通知工单创建者
    target_user_id := ticket_record.user_id;
    notification_title := '您的工单有新回复';
    notification_content := COALESCE(reply_user_profile.display_name, reply_user_profile.username, '支持人员') || 
      ' 回复了您的工单：' || (SELECT title FROM support_tickets WHERE id = NEW.ticket_id);
  END IF;

  -- 创建通知
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
      target_user_id,
      'system',
      notification_title,
      notification_content,
      NEW.ticket_id,
      'support_ticket',
      notification_link,
      NEW.user_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'create_ticket_reply_notification: Failed to insert notification for user_id: %, error: %', 
        target_user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_ticket_reply_notification ON support_ticket_replies;
CREATE TRIGGER trigger_create_ticket_reply_notification
  AFTER INSERT ON support_ticket_replies
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_reply_notification();

-- 3. 工单状态变更通知：通知工单创建者
CREATE OR REPLACE FUNCTION create_ticket_status_change_notification()
RETURNS TRIGGER AS $$
DECLARE
  status_changer_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  status_text TEXT;
BEGIN
  -- 只在状态实际变更时发送通知
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- 获取状态变更者信息（可能是 admin/support）
  SELECT display_name, username INTO status_changer_profile
  FROM profiles
  WHERE id = auth.uid();

  -- 状态文本映射
  CASE NEW.status
    WHEN 'in_progress' THEN status_text := '处理中';
    WHEN 'resolved' THEN status_text := '已解决';
    WHEN 'closed' THEN status_text := '已关闭';
    ELSE status_text := NEW.status;
  END CASE;

  notification_title := '工单状态已更新';
  notification_content := '您的工单"' || NEW.title || '"状态已更新为：' || status_text;

  -- 通知工单创建者
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
      NEW.id,
      'support_ticket',
      '/support/tickets/' || NEW.id::TEXT,
      COALESCE(auth.uid(), NEW.user_id)
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'create_ticket_status_change_notification: Failed to insert notification for user_id: %, error: %', 
        NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_ticket_status_change_notification ON support_tickets;
CREATE TRIGGER trigger_create_ticket_status_change_notification
  AFTER UPDATE OF status ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION create_ticket_status_change_notification();
