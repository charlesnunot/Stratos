-- 增强举报通知内容：在商品举报通知中添加商品名称
-- 让管理员/客服无需点进后台也能快速识别被举报商品

CREATE OR REPLACE FUNCTION create_report_notification()
RETURNS TRIGGER AS $$
DECLARE
  reporter_profile RECORD;
  admin_user RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  reported_type_label TEXT;
  product_name TEXT;
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
  notification_link := '/admin/reports';

  -- 商品举报：在通知内容中带上商品名称
  IF NEW.reported_type = 'product' THEN
    SELECT name INTO product_name
    FROM products
    WHERE id = NEW.reported_id::UUID;

    notification_content :=
      COALESCE(reporter_profile.display_name, reporter_profile.username, '某用户')
      || ' 举报了'
      || reported_type_label
      || '《'
      || COALESCE(product_name, '未知商品')
      || '》'
      || '（'
      || NEW.reason
      || '）';
  ELSE
    notification_content :=
      COALESCE(reporter_profile.display_name, reporter_profile.username, '某用户')
      || ' 举报了'
      || reported_type_label
      || '（'
      || NEW.reason
      || '）';
  END IF;

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

-- 触发器已存在于 074_add_report_notification_trigger.sql
-- 函数替换会自动更新行为，无需重新创建触发器

