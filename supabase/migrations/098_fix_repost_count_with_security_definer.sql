-- 修复转发计数触发器，添加SECURITY DEFINER
-- 确保触发器可以绕过RLS策略更新转发计数

-- 重新创建转发计数触发器函数，添加SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_repost_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- 关键修复：允许绕过RLS
AS $$
DECLARE
  unique_repost_count INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 统计有多少个不同的用户转发了这个项目（不按目标用户统计）
    SELECT COUNT(DISTINCT user_id) INTO unique_repost_count
    FROM reposts
    WHERE item_type = NEW.item_type
      AND original_item_id = NEW.original_item_id;
    
    -- 根据item_type更新对应的计数
    IF NEW.item_type = 'post' THEN
      UPDATE posts
      SET repost_count = unique_repost_count
      WHERE id = NEW.original_item_id::UUID;
      
      -- Debug: Log if no rows were updated
      IF NOT FOUND THEN
        RAISE WARNING 'update_repost_count: No post found with id: %', NEW.original_item_id;
      END IF;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE products
      SET repost_count = unique_repost_count
      WHERE id = NEW.original_item_id::UUID;
      
      -- Debug: Log if no rows were updated
      IF NOT FOUND THEN
        RAISE WARNING 'update_repost_count: No product found with id: %', NEW.original_item_id;
      END IF;
    END IF;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- 统计有多少个不同的用户转发了这个项目
    SELECT COUNT(DISTINCT user_id) INTO unique_repost_count
    FROM reposts
    WHERE item_type = OLD.item_type
      AND original_item_id = OLD.original_item_id;
    
    -- 根据item_type更新对应的计数
    IF OLD.item_type = 'post' THEN
      UPDATE posts
      SET repost_count = GREATEST(unique_repost_count, 0)
      WHERE id = OLD.original_item_id::UUID;
      
      -- Debug: Log if no rows were updated
      IF NOT FOUND THEN
        RAISE WARNING 'update_repost_count: No post found with id: %', OLD.original_item_id;
      END IF;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE products
      SET repost_count = GREATEST(unique_repost_count, 0)
      WHERE id = OLD.original_item_id::UUID;
      
      -- Debug: Log if no rows were updated
      IF NOT FOUND THEN
        RAISE WARNING 'update_repost_count: No product found with id: %', OLD.original_item_id;
      END IF;
    END IF;
    
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 触发器已存在于 038_add_repost_support.sql
-- 函数替换会自动更新行为，无需重新创建触发器

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'update_repost_count';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function update_repost_count does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function update_repost_count verified: SECURITY DEFINER = %', has_security_definer;
END $$;
