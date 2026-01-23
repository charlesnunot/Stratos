-- Fix favorite_count trigger with SECURITY DEFINER to bypass RLS
-- This ensures the trigger can update posts.favorite_count even when RLS is enabled

-- Step 1: Recreate the trigger function with SECURITY DEFINER
-- This allows the function to execute with the privileges of the function owner (postgres)
-- and bypass Row Level Security policies
CREATE OR REPLACE FUNCTION update_favorite_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- This is the key fix: allows bypassing RLS
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_type = 'post' THEN
      UPDATE posts
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id::UUID;
      
      -- Debug: Log if no rows were updated
      IF NOT FOUND THEN
        RAISE WARNING 'update_favorite_count: No post found with id: %', NEW.item_id;
      END IF;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id::UUID;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_favorite_count: No product found with id: %', NEW.item_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'post' THEN
      UPDATE posts
      SET favorite_count = GREATEST(0, favorite_count - 1)
      WHERE id = OLD.item_id::UUID;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_favorite_count: No post found with id: %', OLD.item_id;
      END IF;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = GREATEST(0, favorite_count - 1)
      WHERE id = OLD.item_id::UUID;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_favorite_count: No product found with id: %', OLD.item_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 2: Ensure trigger exists and is enabled
DROP TRIGGER IF EXISTS trigger_update_favorite_count ON favorites;
CREATE TRIGGER trigger_update_favorite_count
  AFTER INSERT OR DELETE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_favorite_count();

-- Step 3: Verify the function has SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'update_favorite_count';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function update_favorite_count does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function update_favorite_count verified: SECURITY DEFINER = %', has_security_definer;
END $$;

-- Step 4: Fix all existing favorite counts
-- This recalculates favorite_count for all posts and products based on actual favorites
UPDATE posts
SET favorite_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM favorites
   WHERE favorites.item_type = 'post'
     AND favorites.item_id::UUID = posts.id::UUID),
  0
);

UPDATE products
SET favorite_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM favorites
   WHERE favorites.item_type = 'product'
     AND favorites.item_id::UUID = products.id::UUID),
  0
);

-- Step 5: Verify the fix for the specific post
SELECT 
  'Verification' as check_type,
  p.id::text as post_id,
  p.favorite_count as updated_favorite_count,
  (
    SELECT COUNT(*)::INT
    FROM favorites
    WHERE item_type = 'post'
      AND item_id::UUID = p.id::UUID
  ) as actual_favorite_count,
  CASE 
    WHEN p.favorite_count = (
      SELECT COUNT(*)::INT
      FROM favorites
      WHERE item_type = 'post'
        AND item_id::UUID = p.id::UUID
    ) THEN '✓ Correct'
    ELSE '✗ Still incorrect'
  END as status
FROM posts p
WHERE p.id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::UUID;
