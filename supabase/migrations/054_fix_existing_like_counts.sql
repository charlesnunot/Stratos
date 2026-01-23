-- Fix existing like_count inconsistencies in posts table
-- This migration calls the fix function created in 052_add_like_count_consistency_check.sql
-- Use with caution: may take time on large datasets

-- Fix all posts with inconsistent like_count
-- This will update posts.like_count to match the actual count in likes table
DO $$
DECLARE
  fixed_count INT;
BEGIN
  -- Call the fix function and count how many posts were fixed
  SELECT COUNT(*) INTO fixed_count
  FROM fix_post_like_counts();
  
  -- Log the result (optional, can be viewed in migration logs)
  RAISE NOTICE 'Fixed like_count for % posts', fixed_count;
END $$;

-- Note: If you want to see which posts were fixed, you can run:
-- SELECT * FROM fix_post_like_counts();
-- This will return post_id, old_count, new_count, and fixed status
