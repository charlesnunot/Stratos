-- 你可能感兴趣的人 RPC：共同关注 + 页面主人粉丝，排除已关注；支持游标分页；不足时用活跃用户补足
SET search_path = public;

CREATE OR REPLACE FUNCTION public.suggested_users(
  p_profile_user_id UUID,
  p_limit INT DEFAULT 6,
  p_cursor UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  follower_count INT,
  following_count INT,
  is_mutual_friend BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR v_user_id = p_profile_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH profile_following AS (
    SELECT f.followee_id FROM follows f WHERE f.follower_id = p_profile_user_id
  ),
  my_following AS (
    SELECT f.followee_id FROM follows f WHERE f.follower_id = v_user_id
  ),
  -- 1) 共同朋友：主人关注 ∩ 当前用户关注
  mutual AS (
    SELECT p.id AS pid, COALESCE(p.username, '')::TEXT AS uname, p.display_name AS dname, p.avatar_url AS avurl,
           COALESCE(p.follower_count, 0)::INT AS fcount, COALESCE(p.following_count, 0)::INT AS fwing,
           true AS is_mutual
    FROM follows f
    INNER JOIN profile_following pf ON pf.followee_id = f.followee_id
    INNER JOIN follows cur ON cur.followee_id = f.followee_id AND cur.follower_id = v_user_id
    INNER JOIN profiles p ON p.id = f.followee_id
    WHERE f.follower_id = p_profile_user_id
      AND p.id != v_user_id
      AND p.id != p_profile_user_id
      AND p.status = 'active'
      AND (p_cursor IS NULL OR p.id > p_cursor)
    ORDER BY is_mutual DESC, p.id ASC
    LIMIT p_limit
  ),
  mutual_count AS (SELECT COUNT(*)::INT AS c FROM mutual),
  -- 2) 可能认识的人：页面主人的粉丝，当前用户未关注、非自己、非主人
  followers AS (
    SELECT p.id AS pid, COALESCE(p.username, '')::TEXT AS uname, p.display_name AS dname, p.avatar_url AS avurl,
           COALESCE(p.follower_count, 0)::INT AS fcount, COALESCE(p.following_count, 0)::INT AS fwing,
           false AS is_mutual
    FROM follows f
    INNER JOIN profiles p ON p.id = f.follower_id
    WHERE f.followee_id = p_profile_user_id
      AND p.id != v_user_id
      AND p.id != p_profile_user_id
      AND p.id NOT IN (SELECT followee_id FROM my_following)
      AND p.id NOT IN (SELECT pid FROM mutual)
      AND p.status = 'active'
    ORDER BY p.follower_count DESC NULLS LAST, p.id ASC
    LIMIT (SELECT GREATEST(0, p_limit - mc.c) FROM mutual_count mc)
  ),
  primary_union AS (
    SELECT m.pid, m.uname, m.dname, m.avurl, m.fcount, m.fwing, m.is_mutual FROM mutual m
    UNION ALL
    SELECT f.pid, f.uname, f.dname, f.avurl, f.fcount, f.fwing, f.is_mutual FROM followers f
  ),
  primary_count AS (SELECT COUNT(*)::INT AS c FROM primary_union),
  -- 3) fallback：不足时用活跃用户补足（同语言或全局热门）
  fallback_recs AS (
    SELECT p.id AS pid, COALESCE(p.username, '')::TEXT AS uname, p.display_name AS dname, p.avatar_url AS avurl,
           COALESCE(p.follower_count, 0)::INT AS fcount, COALESCE(p.following_count, 0)::INT AS fwing,
           false AS is_mutual
    FROM profiles p
    WHERE p.id != v_user_id
      AND p.id != p_profile_user_id
      AND p.status = 'active'
      AND p.id NOT IN (SELECT followee_id FROM my_following)
      AND p.id NOT IN (SELECT pid FROM primary_union)
    ORDER BY p.follower_count DESC NULLS LAST, p.id ASC
    LIMIT (SELECT GREATEST(0, p_limit - pc.c) FROM primary_count pc)
  )
  SELECT pu.pid, pu.uname, pu.dname, pu.avurl, pu.fcount, pu.fwing, pu.is_mutual FROM primary_union pu
  UNION ALL
  SELECT fr.pid, fr.uname, fr.dname, fr.avurl, fr.fcount, fr.fwing, fr.is_mutual FROM fallback_recs fr;
END;
$$;

COMMENT ON FUNCTION public.suggested_users(UUID, INT, UUID) IS
  'Suggested users for profile page: mutual friends (profile following ∩ current user following) plus profile followers; fallback to active users when insufficient. Caller must be authenticated (auth.uid()).';
