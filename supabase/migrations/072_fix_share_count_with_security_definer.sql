-- Fix share_count trigger with SECURITY DEFINER to bypass RLS
-- This ensures the trigger can update posts.share_count even when RLS is enabled

-- Step 1: Recreate the trigger function with SECURITY DEFINER
-- This allows the function to execute with the privileges of the function owner (postgres)
-- and bypass Row Level Security policies
CREATE OR REPLACE FUNCTION update_item_share_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- This is the key fix: allows bypassing RLS
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_type = 'post' THEN
      UPDATE posts
      SET share_count = share_count + 1
      WHERE id = NEW.item_id::UUID;
      
      -- Debug: Log if no rows were updated
      IF NOT FOUND THEN
        RAISE WARNING 'update_item_share_count: No post found with id: %', NEW.item_id;
      END IF;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE products
      SET share_count = share_count + 1
      WHERE id = NEW.item_id::UUID;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_item_share_count: No product found with id: %', NEW.item_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'post' THEN
      UPDATE posts
      SET share_count = GREATEST(0, share_count - 1)
      WHERE id = OLD.item_id::UUID;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_item_share_count: No post found with id: %', OLD.item_id;
      END IF;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE products
      SET share_count = GREATEST(0, share_count - 1)
      WHERE id = OLD.item_id::UUID;
      
      IF NOT FOUND THEN
        RAISE WARNING 'update_item_share_count: No product found with id: %', OLD.item_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 2: Ensure trigger exists and is enabled
DROP TRIGGER IF EXISTS trigger_update_item_share_count ON shares;
CREATE TRIGGER trigger_update_item_share_count
  AFTER INSERT OR DELETE ON shares
  FOR EACH ROW
  EXECUTE FUNCTION update_item_share_count();

-- Step 3: Verify the function has SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'update_item_share_count';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function update_item_share_count does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function update_item_share_count verified: SECURITY DEFINER = %', has_security_definer;
END $$;

-- Step 4: Fix all existing share counts
-- This recalculates share_count for all posts and products based on actual shares
UPDATE posts
SET share_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM shares
   WHERE shares.item_type = 'post'
     AND shares.item_id::UUID = posts.id::UUID),
  0
);

UPDATE products
SET share_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM shares
   WHERE shares.item_type = 'product'
     AND shares.item_id::UUID = products.id::UUID),
  0
);

-- Step 5: Verify the fix for the specific post
SELECT 
  'Verification' as check_type,
  p.id::text as post_id,
  p.share_count as updated_share_count,
  (
    SELECT COUNT(*)::INT
    FROM shares
    WHERE item_type = 'post'
      AND item_id::UUID = p.id::UUID
  ) as actual_share_count,
  CASE 
    WHEN p.share_count = (
      SELECT COUNT(*)::INT
      FROM shares
      WHERE item_type = 'post'
        AND item_id::UUID = p.id::UUID
    ) THEN '✓ Correct'
    ELSE '✗ Still incorrect'
  END as status
FROM posts p
WHERE p.id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'::UUID;
