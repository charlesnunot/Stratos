-- Fix existing comment_count inconsistencies in posts table
-- This migration calls the fix function created in 056_add_comment_count_consistency_check.sql
-- Use with caution: may take time on large datasets

-- Fix all posts with inconsistent comment_count
-- This will update posts.comment_count to match the actual count of approved comments
DO $$
DECLARE
  fixed_count INT;
BEGIN
  -- Call the fix function and count how many posts were fixed
  SELECT COUNT(*) INTO fixed_count
  FROM fix_post_comment_counts();
  
  -- Log the result (optional, can be viewed in migration logs)
  RAISE NOTICE 'Fixed comment_count for % posts', fixed_count;
END $$;

-- Note: If you want to see which posts were fixed, you can run:
-- SELECT * FROM fix_post_comment_counts();
-- This will return post_id, old_count, new_count, and fixed status
