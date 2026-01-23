-- Add comment count consistency check and fix function
-- This function can be used to repair comment_count inconsistencies in posts table
-- Use with caution: test in development first, may take time on large datasets

-- Function to fix comment_count for all posts or a specific post
CREATE OR REPLACE FUNCTION public.fix_post_comment_counts(post_id_filter UUID DEFAULT NULL)
RETURNS TABLE(
  post_id UUID,
  old_count INT,
  new_count INT,
  fixed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH corrected_counts AS (
    SELECT 
      p.id,
      p.comment_count AS old_count,
      COALESCE(COUNT(c.id), 0)::INT AS new_count
    FROM posts p
    LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'approved'
    WHERE (post_id_filter IS NULL OR p.id = post_id_filter)
    GROUP BY p.id, p.comment_count
    HAVING p.comment_count != COALESCE(COUNT(c.id), 0)::INT
  )
  UPDATE posts p
  SET comment_count = cc.new_count
  FROM corrected_counts cc
  WHERE p.id = cc.id
  RETURNING 
    p.id,
    cc.old_count,
    cc.new_count,
    true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check comment_count consistency (read-only, for reporting)
CREATE OR REPLACE FUNCTION public.check_post_comment_counts_consistency()
RETURNS TABLE(
  post_id UUID,
  stored_count INT,
  actual_count BIGINT,
  is_consistent BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.comment_count AS stored_count,
    COUNT(c.id) AS actual_count,
    (p.comment_count = COUNT(c.id)) AS is_consistent
  FROM posts p
  LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'approved'
  GROUP BY p.id, p.comment_count
  ORDER BY p.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users (optional, can be restricted to admins)
-- GRANT EXECUTE ON FUNCTION public.fix_post_comment_counts TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.check_post_comment_counts_consistency TO authenticated;
