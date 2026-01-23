-- 创建分享通知触发器
-- 当用户分享帖子或商品时，自动创建通知发送给内容创建者
-- 重要：此迁移依赖于迁移：
--   - 019_add_notification_link_field.sql
--   - 023_add_notification_actor_id.sql
--   - 070_add_share_notification_type.sql
-- 请确保先执行这些迁移，再执行此迁移

-- 创建分享通知触发器函数
CREATE OR REPLACE FUNCTION create_share_notification()
RETURNS TRIGGER AS $$
DECLARE
  content_creator_id UUID;
  sharer_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  notification_related_type TEXT;
BEGIN
  -- 获取分享者信息
  SELECT display_name, username INTO sharer_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 根据分享类型处理不同的内容
  IF NEW.item_type = 'post' THEN
    -- 获取帖子作者 ID
    SELECT user_id INTO content_creator_id
    FROM posts
    WHERE id = NEW.item_id::UUID;

    -- 如果帖子不存在或已被删除，直接返回
    IF content_creator_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- 避免给自己分享时发送通知
    IF content_creator_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    notification_title := '您的帖子被分享';
    notification_content := COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户') || ' 分享了您的帖子';
    notification_link := '/post/' || NEW.item_id::TEXT;
    notification_related_type := 'post';

  ELSIF NEW.item_type = 'product' THEN
    -- 获取商品卖家 ID
    SELECT seller_id INTO content_creator_id
    FROM products
    WHERE id = NEW.item_id::UUID;

    -- 如果商品不存在或已被删除，直接返回
    IF content_creator_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- 避免给自己分享时发送通知
    IF content_creator_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    notification_title := '您的商品被分享';
    notification_content := COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户') || ' 分享了您的商品';
    notification_link := '/product/' || NEW.item_id::TEXT;
    notification_related_type := 'product';
  ELSE
    -- 不支持的分享类型，直接返回
    RETURN NEW;
  END IF;

  -- 创建分享通知
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
    content_creator_id,
    'share',
    notification_title,
    notification_content,
    NEW.item_id::UUID,
    notification_related_type,
    notification_link,
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_share_notification ON shares;
CREATE TRIGGER trigger_create_share_notification
  AFTER INSERT ON shares
  FOR EACH ROW
  EXECUTE FUNCTION create_share_notification();
