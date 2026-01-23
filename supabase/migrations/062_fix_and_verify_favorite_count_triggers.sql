-- Fix and verify favorite count triggers
-- This migration ensures the triggers exist and work correctly
-- It's idempotent and safe to run multiple times
-- 
-- IMPORTANT: This uses a single unified function (like update_item_share_count)
-- which is more efficient than having separate triggers

-- 1. Create a unified trigger function that handles both posts and products
CREATE OR REPLACE FUNCTION update_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_type = 'post' THEN
      UPDATE posts
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'post' THEN
      UPDATE posts
      SET favorite_count = GREATEST(0, favorite_count - 1)
      WHERE id = OLD.item_id;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = GREATEST(0, favorite_count - 1)
      WHERE id = OLD.item_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. Drop old separate triggers if they exist
DROP TRIGGER IF EXISTS trigger_update_post_favorite_count ON favorites;
DROP TRIGGER IF EXISTS trigger_update_product_favorite_count ON favorites;

-- 3. Create a single unified trigger (more efficient)
DROP TRIGGER IF EXISTS trigger_update_favorite_count ON favorites;
CREATE TRIGGER trigger_update_favorite_count
  AFTER INSERT OR DELETE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_favorite_count();

-- 4. Verify trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_update_favorite_count' 
    AND tgrelid = 'favorites'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_update_favorite_count was not created';
  END IF;
END $$;

-- 5. Verify function exists
DO $$
DECLARE
  test_result BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'update_favorite_count'
  ) INTO test_result;
  
  IF NOT test_result THEN
    RAISE EXCEPTION 'Function update_favorite_count does not exist';
  END IF;
END $$;
