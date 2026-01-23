-- Fix favorite count trigger to ensure proper type casting
-- This migration fixes the issue where favorite_count is not updated correctly
-- The problem is that item_id needs explicit type casting in the WHERE clause

-- 1. Recreate the trigger function with explicit type casting
CREATE OR REPLACE FUNCTION update_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_type = 'post' THEN
      UPDATE posts
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id::UUID;
      
      -- Debug: Log if no rows were updated (shouldn't happen)
      IF NOT FOUND THEN
        RAISE WARNING 'No post found with id: %', NEW.item_id;
      END IF;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id::UUID;
      
      -- Debug: Log if no rows were updated (shouldn't happen)
      IF NOT FOUND THEN
        RAISE WARNING 'No product found with id: %', NEW.item_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'post' THEN
      UPDATE posts
      SET favorite_count = GREATEST(0, favorite_count - 1)
      WHERE id = OLD.item_id::UUID;
      
      -- Debug: Log if no rows were updated (shouldn't happen)
      IF NOT FOUND THEN
        RAISE WARNING 'No post found with id: %', OLD.item_id;
      END IF;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = GREATEST(0, favorite_count - 1)
      WHERE id = OLD.item_id::UUID;
      
      -- Debug: Log if no rows were updated (shouldn't happen)
      IF NOT FOUND THEN
        RAISE WARNING 'No product found with id: %', OLD.item_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. Verify the trigger still exists (it should, but we'll check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_update_favorite_count' 
    AND tgrelid = 'favorites'::regclass
  ) THEN
    -- Recreate the trigger if it doesn't exist
    CREATE TRIGGER trigger_update_favorite_count
      AFTER INSERT OR DELETE ON favorites
      FOR EACH ROW
      EXECUTE FUNCTION update_favorite_count();
  END IF;
END $$;

-- 3. Fix existing favorite counts for all posts and products
-- This ensures the counts are correct even if triggers didn't fire before
UPDATE posts
SET favorite_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM favorites
   WHERE favorites.item_type = 'post'
     AND favorites.item_id::UUID = posts.id),
  0
);

UPDATE products
SET favorite_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM favorites
   WHERE favorites.item_type = 'product'
     AND favorites.item_id::UUID = products.id),
  0
);
