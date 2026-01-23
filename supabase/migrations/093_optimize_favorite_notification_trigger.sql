-- 优化收藏通知触发器，添加去重功能
-- 防止用户快速点击收藏/取消收藏造成重复通知
-- 参考商品点赞通知和商品"想要"通知的实现模式

-- 创建收藏通知触发器函数（带去重功能）
CREATE OR REPLACE FUNCTION create_favorite_notification()
RETURNS TRIGGER AS $$
DECLARE
  content_creator_id UUID;
  favoriter_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  notification_related_type TEXT;
  existing_notification_id UUID;
BEGIN
  -- 获取收藏者信息
  SELECT display_name, username INTO favoriter_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 根据收藏类型处理不同的内容
  IF NEW.item_type = 'post' THEN
    -- 获取帖子作者 ID
    SELECT user_id INTO content_creator_id
    FROM posts
    WHERE id = NEW.item_id::UUID;

    -- 如果帖子不存在或已被删除，直接返回
    IF content_creator_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- 避免给自己收藏时发送通知
    IF content_creator_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- 检查最近5秒内是否已有相同通知（去重）
    SELECT id INTO existing_notification_id
    FROM notifications
    WHERE user_id = content_creator_id
      AND type = 'favorite'
      AND related_id = NEW.item_id
      AND related_type = 'post'
      AND actor_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '5 seconds'
    LIMIT 1;

    -- 如果最近已有通知，跳过创建新通知
    IF existing_notification_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    notification_title := '您的帖子被收藏';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 收藏了您的帖子';
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

    -- 避免给自己收藏时发送通知
    IF content_creator_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- 检查最近5秒内是否已有相同通知（去重）
    SELECT id INTO existing_notification_id
    FROM notifications
    WHERE user_id = content_creator_id
      AND type = 'favorite'
      AND related_id = NEW.item_id
      AND related_type = 'product'
      AND actor_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '5 seconds'
    LIMIT 1;

    -- 如果最近已有通知，跳过创建新通知
    IF existing_notification_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    notification_title := '您的商品被收藏';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 收藏了您的商品';
    notification_link := '/product/' || NEW.item_id::TEXT;
    notification_related_type := 'product';

  ELSIF NEW.item_type = 'user' THEN
    -- 用户被收藏的情况，通知被收藏的用户
    content_creator_id := NEW.item_id::UUID;

    -- 避免给自己收藏时发送通知
    IF content_creator_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- 检查最近5秒内是否已有相同通知（去重）
    SELECT id INTO existing_notification_id
    FROM notifications
    WHERE user_id = content_creator_id
      AND type = 'favorite'
      AND related_id = NEW.item_id
      AND related_type = 'user'
      AND actor_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '5 seconds'
    LIMIT 1;

    -- 如果最近已有通知，跳过创建新通知
    IF existing_notification_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    notification_title := '您被添加到特别关注';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 将您添加到了特别关注';
    notification_link := '/profile/' || NEW.item_id::TEXT;
    notification_related_type := 'user';

  ELSE
    -- 其他类型的收藏暂不发送通知
    RETURN NEW;
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
    content_creator_id,
    'favorite',
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

-- 触发器已存在于 033_add_favorite_notification_trigger.sql
-- 函数替换会自动更新行为，无需重新创建触发器
