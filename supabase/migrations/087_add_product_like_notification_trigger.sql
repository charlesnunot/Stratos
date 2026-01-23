-- 创建商品点赞通知触发器
-- 当用户点赞商品时，自动创建通知发送给商品卖家
-- 重要：此迁移依赖于迁移 019_add_notification_link_field.sql 和 023_add_notification_actor_id.sql
-- 请确保先执行这些迁移，再执行此迁移

-- 创建商品点赞通知触发器函数
CREATE OR REPLACE FUNCTION create_product_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  product_seller_id UUID;
  liker_profile RECORD;
  existing_notification_id UUID;
BEGIN
  -- 获取商品卖家 ID
  SELECT seller_id INTO product_seller_id
  FROM products
  WHERE id = NEW.product_id;

  -- 如果商品不存在或已被删除，直接返回
  IF product_seller_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 避免给自己点赞时发送通知
  IF product_seller_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- 检查最近5秒内是否已有相同通知（去重）
  -- 这可以防止用户快速点击造成的重复通知
  SELECT id INTO existing_notification_id
  FROM notifications
  WHERE user_id = product_seller_id
    AND type = 'like'
    AND related_id = NEW.product_id
    AND related_type = 'product'
    AND actor_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '5 seconds'
  LIMIT 1;

  -- 如果最近已有通知，跳过创建新通知
  IF existing_notification_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 获取点赞者信息
  SELECT display_name, username INTO liker_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- 创建商品点赞通知
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
    product_seller_id,
    'like',
    '您的商品收到点赞',
    COALESCE(liker_profile.display_name, liker_profile.username, '某用户') || ' 点赞了您的商品',
    NEW.product_id,
    'product',
    '/product/' || NEW.product_id::text,
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_product_like_notification ON product_likes;
CREATE TRIGGER trigger_create_product_like_notification
  AFTER INSERT ON product_likes
  FOR EACH ROW
  EXECUTE FUNCTION create_product_like_notification();
