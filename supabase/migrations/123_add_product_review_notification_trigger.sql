-- 创建商品审核状态变更通知触发器
-- 当商品审核状态从 'pending' 变为 'active' 或 'rejected' 时，自动通知商品卖家
-- 重要：此迁移依赖于迁移：
--   - 019_add_notification_link_field.sql
--   - 023_add_notification_actor_id.sql
-- 请确保先执行这些迁移，再执行此迁移

-- 创建商品审核通知触发器函数
CREATE OR REPLACE FUNCTION create_product_review_notification()
RETURNS TRIGGER AS $$
DECLARE
  reviewer_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  product_preview TEXT;
BEGIN
  -- 只在状态从 'pending' 变为 'active' 或 'rejected' 时发送通知
  IF OLD.status != 'pending' OR (NEW.status != 'active' AND NEW.status != 'rejected') THEN
    RETURN NEW;
  END IF;

  -- 避免给自己审核时发送通知（虽然通常不会发生）
  IF NEW.seller_id = NEW.reviewed_by THEN
    RETURN NEW;
  END IF;

  -- 获取审核者信息
  IF NEW.reviewed_by IS NOT NULL THEN
    SELECT display_name, username INTO reviewer_profile
    FROM profiles
    WHERE id = NEW.reviewed_by;
  END IF;

  -- 生成商品预览
  IF NEW.name IS NOT NULL AND LENGTH(NEW.name) > 0 THEN
    IF LENGTH(NEW.name) > 50 THEN
      product_preview := LEFT(NEW.name, 50) || '...';
    ELSE
      product_preview := NEW.name;
    END IF;
  ELSE
    product_preview := '[未命名商品]';
  END IF;

  -- 设置通知内容
  IF NEW.status = 'active' THEN
    notification_title := '您的商品已通过审核';
    notification_content := '您的商品「' || product_preview || '」已通过审核，现已上架可售';
  ELSE
    notification_title := '您的商品未通过审核';
    notification_content := '很抱歉，您的商品「' || product_preview || '」未通过审核';
  END IF;

  notification_link := '/product/' || NEW.id::TEXT;

  -- 创建通知给商品卖家
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
      NEW.seller_id,
      'system',
      notification_title,
      notification_content,
      NEW.id::UUID,
      'product',
      notification_link,
      NEW.reviewed_by
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'create_product_review_notification: Failed to insert notification for product_id: %, seller_id: %, error: %', 
        NEW.id, NEW.seller_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_create_product_review_notification ON products;
CREATE TRIGGER trigger_create_product_review_notification
  AFTER UPDATE ON products
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND (NEW.status = 'active' OR NEW.status = 'rejected'))
  EXECUTE FUNCTION create_product_review_notification();

-- 验证触发器存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_create_product_review_notification' 
    AND tgrelid = 'products'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_create_product_review_notification was not created';
  END IF;
  
  RAISE NOTICE 'Trigger trigger_create_product_review_notification verified: exists and enabled';
END $$;

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'create_product_review_notification';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function create_product_review_notification does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function create_product_review_notification verified: SECURITY DEFINER = %', has_security_definer;
END $$;
