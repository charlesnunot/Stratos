-- 更新工单通知触发器，添加 content_key 和 content_params 支持国际化
-- 替换硬编码中文通知内容

-- 1. 工单创建通知：添加 content_key
CREATE OR REPLACE FUNCTION create_ticket_creation_notification()
RETURNS TRIGGER AS $$
DECLARE
  admin_user UUID;
  ticket_creator_profile RECORD;
BEGIN
  -- 获取工单创建者信息
  SELECT display_name, username INTO ticket_creator_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 为所有管理员和 support 角色用户创建通知 (使用 content_key for i18n)
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
        actor_id,
        content_key,
        content_params
      )
      VALUES (
        admin_user,
        'system',
        'New Ticket Created',
        COALESCE(ticket_creator_profile.display_name, ticket_creator_profile.username, 'User') || 
          ' created a new ticket: ' || LEFT(NEW.title, 50),
        NEW.id,
        'support_ticket',
        '/admin/support',
        NEW.user_id,
        'ticket_created',
        jsonb_build_object(
          'userName', COALESCE(ticket_creator_profile.display_name, ticket_creator_profile.username, 'User'),
          'ticketTitle', LEFT(NEW.title, 50)
        )
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

-- 2. 工单回复通知：添加 content_key
CREATE OR REPLACE FUNCTION create_ticket_reply_notification()
RETURNS TRIGGER AS $$
DECLARE
  ticket_record RECORD;
  reply_user_profile RECORD;
  admin_user UUID;
  notification_link TEXT;
  target_user_id UUID;
  ticket_title TEXT;
BEGIN
  -- 获取工单信息
  SELECT user_id, assigned_to, status, title INTO ticket_record
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
  ticket_title := ticket_record.title;

  -- 判断通知目标
  IF NEW.user_id = ticket_record.user_id THEN
    -- 用户回复自己的工单，通知被分配的支持人员（如果有）
    IF ticket_record.assigned_to IS NOT NULL AND ticket_record.assigned_to != NEW.user_id THEN
      target_user_id := ticket_record.assigned_to;
      BEGIN
        INSERT INTO notifications (
          user_id, type, title, content,
          related_id, related_type, link, actor_id,
          content_key, content_params
        )
        VALUES (
          target_user_id,
          'system',
          'New Ticket Reply',
          COALESCE(reply_user_profile.display_name, reply_user_profile.username, 'User') || 
            ' replied to ticket: ' || ticket_title,
          NEW.ticket_id,
          'support_ticket',
          notification_link,
          NEW.user_id,
          'ticket_reply',
          jsonb_build_object(
            'userName', COALESCE(reply_user_profile.display_name, reply_user_profile.username, 'User'),
            'ticketTitle', ticket_title
          )
        );
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'create_ticket_reply_notification: Failed to insert notification, error: %', SQLERRM;
      END;
    ELSE
      -- 没有分配的支持人员，通知所有 admin/support
      FOR admin_user IN 
        SELECT id FROM profiles
        WHERE role IN ('admin', 'support')
      LOOP
        BEGIN
          INSERT INTO notifications (
            user_id, type, title, content,
            related_id, related_type, link, actor_id,
            content_key, content_params
          )
          VALUES (
            admin_user,
            'system',
            'New Ticket Reply',
            COALESCE(reply_user_profile.display_name, reply_user_profile.username, 'User') || 
              ' replied to ticket: ' || ticket_title,
            NEW.ticket_id,
            'support_ticket',
            notification_link,
            NEW.user_id,
            'ticket_reply',
            jsonb_build_object(
              'userName', COALESCE(reply_user_profile.display_name, reply_user_profile.username, 'User'),
              'ticketTitle', ticket_title
            )
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'create_ticket_reply_notification: Failed to insert notification for admin user_id: %, error: %', 
              admin_user, SQLERRM;
        END;
      END LOOP;
    END IF;
  ELSE
    -- 支持人员回复，通知工单创建者
    target_user_id := ticket_record.user_id;
    BEGIN
      INSERT INTO notifications (
        user_id, type, title, content,
        related_id, related_type, link, actor_id,
        content_key, content_params
      )
      VALUES (
        target_user_id,
        'system',
        'Your Ticket Has a Reply',
        COALESCE(reply_user_profile.display_name, reply_user_profile.username, 'Support') || 
          ' replied to your ticket: ' || ticket_title,
        NEW.ticket_id,
        'support_ticket',
        notification_link,
        NEW.user_id,
        'ticket_reply_from_support',
        jsonb_build_object(
          'staffName', COALESCE(reply_user_profile.display_name, reply_user_profile.username, 'Support'),
          'ticketTitle', ticket_title
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'create_ticket_reply_notification: Failed to insert notification for user_id: %, error: %', 
          target_user_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 工单状态变更通知：添加 content_key
CREATE OR REPLACE FUNCTION create_ticket_status_change_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- 只在状态实际变更时发送通知
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- 通知工单创建者 (使用 content_key for i18n)
  BEGIN
    INSERT INTO notifications (
      user_id,
      type,
      title,
      content,
      related_id,
      related_type,
      link,
      actor_id,
      content_key,
      content_params
    )
    VALUES (
      NEW.user_id,
      'system',
      'Ticket Status Updated',
      'Your ticket "' || NEW.title || '" status changed to: ' || NEW.status,
      NEW.id,
      'support_ticket',
      '/support/tickets/' || NEW.id::TEXT,
      COALESCE(auth.uid(), NEW.user_id),
      'ticket_status_change',
      jsonb_build_object(
        'ticketTitle', NEW.title,
        'newStatus', NEW.status
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'create_ticket_status_change_notification: Failed to insert notification for user_id: %, error: %', 
        NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_ticket_creation_notification() IS 'Notify admin/support when a new ticket is created (i18n via content_key)';
COMMENT ON FUNCTION create_ticket_reply_notification() IS 'Notify relevant users when a ticket reply is added (i18n via content_key)';
COMMENT ON FUNCTION create_ticket_status_change_notification() IS 'Notify ticket creator when status changes (i18n via content_key)';
