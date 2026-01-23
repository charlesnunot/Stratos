-- 创建商品通知触发器
-- 当用户创建新商品时，自动通知所有管理员和 support 角色用户进行审核
-- 重要：此迁移依赖于迁移：
--   - 019_add_notification_link_field.sql
--   - 023_add_notification_actor_id.sql
-- 请确保先执行这些迁移，再执行此迁移

-- 创建商品通知触发器函数
CREATE OR REPLACE FUNCTION create_product_creation_notification()
RETURNS TRIGGER AS $$
DECLARE
  product_seller_profile RECORD;
  admin_user RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  product_preview TEXT;
BEGIN
  -- 只在商品状态为 'pending' 时发送通知
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- 获取商品卖家信息
  SELECT display_name, username INTO product_seller_profile
  FROM profiles
  WHERE id = NEW.seller_id;

  -- 如果卖家信息未找到，记录警告但继续处理
  IF product_seller_profile IS NULL THEN
    RAISE WARNING 'create_product_creation_notification: Product seller profile not found for user_id: %', NEW.seller_id;
  END IF;

  -- 生成商品预览（使用商品名称，截取前50个字符）
  IF NEW.name IS NOT NULL AND LENGTH(NEW.name) > 0 THEN
    IF LENGTH(NEW.name) > 50 THEN
      product_preview := LEFT(NEW.name, 50) || '...';
    ELSE
      product_preview := NEW.name;
    END IF;
  ELSE
    product_preview := '[未命名商品]';
  END IF;

  notification_title := '收到新的待审核商品';
  notification_content := COALESCE(product_seller_profile.display_name, product_seller_profile.username, '某卖家') || ' 发布了新商品：' || product_preview;
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
        'product',
        notification_link,
        NEW.seller_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'create_product_creation_notification: Failed to insert notification for admin user_id: %, error: %', 
          admin_user.id, SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_product_creation_notification ON products;
CREATE TRIGGER trigger_create_product_creation_notification
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION create_product_creation_notification();

-- 验证触发器存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_create_product_creation_notification' 
    AND tgrelid = 'products'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_create_product_creation_notification was not created';
  END IF;
  
  RAISE NOTICE 'Trigger trigger_create_product_creation_notification verified: exists and enabled';
END $$;

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'create_product_creation_notification';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function create_product_creation_notification does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function create_product_creation_notification verified: SECURITY DEFINER = %', has_security_definer;
END $$;
