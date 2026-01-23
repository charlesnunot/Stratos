-- 增强分享通知触发器，在商品分享通知中添加商品名称
-- 让卖家能够从通知内容直接识别是哪个商品被分享
-- 包含去重功能（基于096的改进）

-- 创建分享通知触发器函数（带去重功能和商品名称）
CREATE OR REPLACE FUNCTION create_share_notification()
RETURNS TRIGGER AS $$
DECLARE
  content_creator_id UUID;
  sharer_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  notification_related_type TEXT;
  existing_notification_id UUID;
  product_name TEXT;
BEGIN
  -- 获取分享者信息
  SELECT display_name, username INTO sharer_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 如果分享者信息未找到，记录警告但继续处理
  IF sharer_profile IS NULL THEN
    RAISE WARNING 'create_share_notification: Sharer profile not found for user_id: %', NEW.user_id;
  END IF;

  -- 根据分享类型处理不同的内容
  IF NEW.item_type = 'post' THEN
    -- 获取帖子作者 ID
    SELECT user_id INTO content_creator_id
    FROM posts
    WHERE id = NEW.item_id::UUID;

    -- 如果帖子不存在或已被删除，记录警告并返回
    IF content_creator_id IS NULL THEN
      RAISE WARNING 'create_share_notification: Post not found with id: %', NEW.item_id;
      RETURN NEW;
    END IF;

    -- 避免给自己分享时发送通知
    IF content_creator_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- 检查最近5秒内是否已有相同通知（去重）
    SELECT id INTO existing_notification_id
    FROM notifications
    WHERE user_id = content_creator_id
      AND type = 'share'
      AND related_id = NEW.item_id
      AND related_type = 'post'
      AND actor_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '5 seconds'
    LIMIT 1;

    -- 如果最近已有通知，跳过创建新通知
    IF existing_notification_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    notification_title := '您的帖子被分享';
    notification_content := COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户') || ' 分享了您的帖子';
    notification_link := '/post/' || NEW.item_id::TEXT;
    notification_related_type := 'post';

  ELSIF NEW.item_type = 'product' THEN
    -- 获取商品卖家 ID 和商品名称
    SELECT seller_id, name INTO content_creator_id, product_name
    FROM products
    WHERE id = NEW.item_id::UUID;

    -- 如果商品不存在或已被删除，记录警告并返回
    IF content_creator_id IS NULL THEN
      RAISE WARNING 'create_share_notification: Product not found with id: %, or seller_id is NULL', NEW.item_id;
      RETURN NEW;
    END IF;

    -- 避免给自己分享时发送通知
    IF content_creator_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- 检查最近5秒内是否已有相同通知（去重）
    SELECT id INTO existing_notification_id
    FROM notifications
    WHERE user_id = content_creator_id
      AND type = 'share'
      AND related_id = NEW.item_id
      AND related_type = 'product'
      AND actor_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '5 seconds'
    LIMIT 1;

    -- 如果最近已有通知，跳过创建新通知
    IF existing_notification_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    notification_title := '您的商品被分享';
    notification_content := COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户') || ' 分享了您的商品《' || COALESCE(product_name, '未知商品') || '》';
    notification_link := '/product/' || NEW.item_id::TEXT;
    notification_related_type := 'product';

  ELSE
    -- 不支持的分享类型，记录警告并返回
    RAISE WARNING 'create_share_notification: Unsupported item_type: %', NEW.item_type;
    RETURN NEW;
  END IF;

  -- 创建分享通知
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
      content_creator_id,
      'share',
      notification_title,
      notification_content,
      NEW.item_id::UUID,
      notification_related_type,
      notification_link,
      NEW.user_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'create_share_notification: Failed to insert notification for item_type: %, item_id: %, error: %', 
        NEW.item_type, NEW.item_id, SQLERRM;
      -- 即使插入失败，也返回 NEW 以避免阻止分享记录的创建
      RETURN NEW;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 触发器已存在于 073_fix_share_notification_for_products.sql
-- 函数替换会自动更新行为，无需重新创建触发器

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'create_share_notification';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function create_share_notification does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function create_share_notification verified: SECURITY DEFINER = %, deduplication and product name enabled', has_security_definer;
END $$;
