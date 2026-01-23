-- Fix product_want_count trigger with SECURITY DEFINER to bypass RLS
-- This ensures the trigger can update products.want_count even when RLS is enabled

-- Step 1: Recreate the trigger function with SECURITY DEFINER
-- This allows the function to execute with the privileges of the function owner (postgres)
-- and bypass Row Level Security policies
CREATE OR REPLACE FUNCTION update_product_want_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- This is the key fix: allows bypassing RLS
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products
    SET want_count = want_count + 1
    WHERE id = NEW.product_id;
    
    -- Debug: Log if no rows were updated
    IF NOT FOUND THEN
      RAISE WARNING 'update_product_want_count: No product found with id: %', NEW.product_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products
    SET want_count = GREATEST(0, want_count - 1)
    WHERE id = OLD.product_id;
    
    IF NOT FOUND THEN
      RAISE WARNING 'update_product_want_count: No product found with id: %', OLD.product_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 2: Ensure trigger exists and is enabled
DROP TRIGGER IF EXISTS trigger_update_product_want_count ON product_wants;
CREATE TRIGGER trigger_update_product_want_count
  AFTER INSERT OR DELETE ON product_wants
  FOR EACH ROW
  EXECUTE FUNCTION update_product_want_count();

-- Step 3: Verify the function has SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'update_product_want_count';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function update_product_want_count does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function update_product_want_count verified: SECURITY DEFINER = %', has_security_definer;
END $$;

-- Step 4: Fix all existing want counts
-- This recalculates want_count for all products based on actual product_wants
UPDATE products
SET want_count = COALESCE(
  (SELECT COUNT(*)::INT
   FROM product_wants
   WHERE product_wants.product_id = products.id),
  0
);
