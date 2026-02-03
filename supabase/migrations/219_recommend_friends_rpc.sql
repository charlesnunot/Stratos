-- 推荐朋友 RPC：你的粉丝也关注的人，排除自己和已关注；支持游标分页；冷启动时用活跃用户补足
SET search_path = public;

CREATE OR REPLACE FUNCTION public.recommend_friends(
  p_limit INT DEFAULT 12,
  p_cursor UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH my_followers AS (
    SELECT f.follower_id FROM follows f WHERE f.followee_id = v_user_id
  ),
  my_following AS (
    SELECT f.followee_id FROM follows f WHERE f.follower_id = v_user_id
  ),
  primary_recs AS (
    SELECT p.id AS pid, COALESCE(p.username, '')::TEXT AS uname, p.display_name AS dname, p.avatar_url AS avurl
    FROM follows f2
    INNER JOIN my_followers mf ON mf.follower_id = f2.follower_id
    INNER JOIN profiles p ON p.id = f2.followee_id
    WHERE f2.followee_id != v_user_id
      AND f2.followee_id NOT IN (SELECT followee_id FROM my_following)
      AND f2.followee_id NOT IN (SELECT follower_id FROM my_followers)
      AND p.status = 'active'
      AND (p_cursor IS NULL OR p.id > p_cursor)
    ORDER BY p.id ASC
    LIMIT p_limit
  ),
  primary_count AS (
    SELECT COUNT(*)::INT AS c FROM primary_recs
  ),
  fallback_recs AS (
    SELECT p.id AS pid, COALESCE(p.username, '')::TEXT AS uname, p.display_name AS dname, p.avatar_url AS avurl
    FROM profiles p
    WHERE p.id != v_user_id
      AND p.status = 'active'
      AND p.id NOT IN (SELECT followee_id FROM my_following)
      AND p.id NOT IN (SELECT pr.pid FROM primary_recs pr)
    ORDER BY p.follower_count DESC NULLS LAST, p.id ASC
    LIMIT (SELECT GREATEST(0, p_limit - pc.c) FROM primary_count pc)
  )
  SELECT pr.pid, pr.uname, pr.dname, pr.avurl FROM primary_recs pr
  UNION ALL
  SELECT fr.pid, fr.uname, fr.dname, fr.avurl FROM fallback_recs fr;
END;
$$;

COMMENT ON FUNCTION public.recommend_friends(INT, UUID) IS
  'Recommend friends: users that my followers follow, excluding self and already following; cursor pagination; fallback to active users when cold start. Caller must be authenticated (auth.uid()).';
