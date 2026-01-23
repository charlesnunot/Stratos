-- Immediate fix for favorite_count issue
-- Run this directly in Supabase SQL Editor to fix the problem right away

-- Step 1: Fix the trigger function with explicit type casting
CREATE OR REPLACE FUNCTION update_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_type = 'post' THEN
      UPDATE posts
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id::UUID;
      
      -- Debug: Log if no rows were updated
      IF NOT FOUND THEN
        RAISE WARNING 'No post found with id: %', NEW.item_id;
      END IF;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = favorite_count + 1
      WHERE id = NEW.item_id::UUID;
      
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
      
      IF NOT FOUND THEN
        RAISE WARNING 'No post found with id: %', OLD.item_id;
      END IF;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE products
      SET favorite_count = GREATEST(0, favorite_count - 1)
      WHERE id = OLD.item_id::UUID;
      
      IF NOT FOUND THEN
        RAISE WARNING 'No product found with id: %', OLD.item_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 2: Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_update_favorite_count ON favorites;
CREATE TRIGGER trigger_update_favorite_count
  AFTER INSERT OR DELETE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_favorite_count();

-- Step 3: Immediately fix all existing favorite counts
-- This will update all posts and products with the correct counts from favorites table
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

-- Step 4: Verify the fix for the specific post mentioned
-- Check if the post now has the correct favorite_count
SELECT 
  p.id,
  p.favorite_count as current_count,
  COUNT(f.id)::INT as actual_favorite_count,
  CASE 
    WHEN p.favorite_count = COUNT(f.id)::INT THEN '✓ Correct'
    ELSE '✗ Mismatch'
  END as status
FROM posts p
LEFT JOIN favorites f ON f.item_type = 'post' AND f.item_id::UUID = p.id
WHERE p.id = 'cab4d818-d84a-413f-9228-8ef6b1c79bcb'
GROUP BY p.id, p.favorite_count;
