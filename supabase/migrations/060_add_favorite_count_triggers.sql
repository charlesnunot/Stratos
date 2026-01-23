-- Create triggers to automatically update favorite_count in posts and products tables
-- This ensures the cached count stays in sync with the favorites table

-- Function to update post favorite count
CREATE OR REPLACE FUNCTION update_post_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.item_type = 'post' THEN
    UPDATE posts
    SET favorite_count = favorite_count + 1
    WHERE id = NEW.item_id::UUID;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.item_type = 'post' THEN
    UPDATE posts
    SET favorite_count = GREATEST(0, favorite_count - 1)
    WHERE id = OLD.item_id::UUID;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to update product favorite count
CREATE OR REPLACE FUNCTION update_product_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.item_type = 'product' THEN
    UPDATE products
    SET favorite_count = favorite_count + 1
    WHERE id = NEW.item_id::UUID;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.item_type = 'product' THEN
    UPDATE products
    SET favorite_count = GREATEST(0, favorite_count - 1)
    WHERE id = OLD.item_id::UUID;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for posts
-- Note: No WHEN condition needed - the function handles the item_type check internally
DROP TRIGGER IF EXISTS trigger_update_post_favorite_count ON favorites;
CREATE TRIGGER trigger_update_post_favorite_count
  AFTER INSERT OR DELETE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_post_favorite_count();

-- Create trigger for products
-- Note: No WHEN condition needed - the function handles the item_type check internally
DROP TRIGGER IF EXISTS trigger_update_product_favorite_count ON favorites;
CREATE TRIGGER trigger_update_product_favorite_count
  AFTER INSERT OR DELETE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_product_favorite_count();
