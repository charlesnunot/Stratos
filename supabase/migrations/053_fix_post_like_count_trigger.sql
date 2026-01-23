-- Fix and verify post like count trigger
-- This ensures the trigger exists and works correctly
-- This migration is idempotent and safe to run multiple times

-- 1. Recreate the trigger function (idempotent)
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts
    SET like_count = like_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Recreate the trigger (idempotent)
-- This ensures the trigger exists and is correctly bound to the likes table
DROP TRIGGER IF EXISTS trigger_update_post_like_count ON likes;
CREATE TRIGGER trigger_update_post_like_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION update_post_like_count();

-- 3. Verify trigger exists (this will error if trigger doesn't exist after creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_update_post_like_count' 
    AND tgrelid = 'likes'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_update_post_like_count was not created';
  END IF;
END $$;
