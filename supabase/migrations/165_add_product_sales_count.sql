-- 添加商品销售量统计功能
-- 当订单状态变为completed时，自动更新商品的sales_count

-- 1. 为products表添加sales_count字段
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS sales_count INT DEFAULT 0;

-- 2. 创建触发器函数：自动更新商品销售量
-- 当订单状态变为completed时，增加销售量
-- 当订单状态从completed变为其他状态时，减少销售量
CREATE OR REPLACE FUNCTION update_product_sales_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- 允许绕过RLS
AS $$
BEGIN
  -- 如果订单状态变为completed，增加销售量
  IF TG_OP = 'INSERT' AND NEW.order_status = 'completed' THEN
    UPDATE products
    SET sales_count = sales_count + NEW.quantity
    WHERE id = NEW.product_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'update_product_sales_count: No product found with id: %', NEW.product_id;
    END IF;
    RETURN NEW;
  END IF;
  
  -- 如果订单状态更新
  IF TG_OP = 'UPDATE' THEN
    -- 如果从非completed变为completed，增加销售量
    IF OLD.order_status != 'completed' AND NEW.order_status = 'completed' THEN
      UPDATE products
      SET sales_count = sales_count + NEW.quantity
      WHERE id = NEW.product_id;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_product_sales_count: No product found with id: %', NEW.product_id;
      END IF;
    -- 如果从completed变为非completed，减少销售量
    ELSIF OLD.order_status = 'completed' AND NEW.order_status != 'completed' THEN
      UPDATE products
      SET sales_count = GREATEST(0, sales_count - OLD.quantity)
      WHERE id = OLD.product_id;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_product_sales_count: No product found with id: %', OLD.product_id;
      END IF;
    -- 如果都是completed但quantity变化了，调整销售量
    ELSIF OLD.order_status = 'completed' AND NEW.order_status = 'completed' AND OLD.quantity != NEW.quantity THEN
      UPDATE products
      SET sales_count = sales_count + (NEW.quantity - OLD.quantity)
      WHERE id = NEW.product_id;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_product_sales_count: No product found with id: %', NEW.product_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  
  -- 如果订单被删除且状态是completed，减少销售量
  IF TG_OP = 'DELETE' AND OLD.order_status = 'completed' THEN
    UPDATE products
    SET sales_count = GREATEST(0, sales_count - OLD.quantity)
    WHERE id = OLD.product_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'update_product_sales_count: No product found with id: %', OLD.product_id;
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. 创建触发器
DROP TRIGGER IF EXISTS trigger_update_product_sales_count ON orders;
CREATE TRIGGER trigger_update_product_sales_count
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_product_sales_count();

-- 4. 初始化现有商品的销售量（统计所有completed订单）
UPDATE products
SET sales_count = COALESCE((
  SELECT SUM(quantity)
  FROM orders
  WHERE product_id = products.id
    AND order_status = 'completed'
), 0);

-- 5. 验证函数具有SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'update_product_sales_count';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function update_product_sales_count does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function update_product_sales_count verified: SECURITY DEFINER = %', has_security_definer;
END $$;
