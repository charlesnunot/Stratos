-- 272: 创建统一的 Feed RPC 函数
-- 只查询 posts 表（简化架构）
-- 版本: v2.0

-- 统一的 Feed RPC，只查询 posts 表
CREATE OR REPLACE FUNCTION public.get_unified_feed_with_reasons(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_followed_only BOOLEAN DEFAULT FALSE,
  p_exclude_viewed_days INT DEFAULT 7,
  p_tier1_base NUMERIC DEFAULT 100,
  p_tier2_base NUMERIC DEFAULT 50,
  p_diversity_n INT DEFAULT 20,
  p_diversity_k INT DEFAULT 2
)
RETURNS TABLE(item_id UUID, item_type TEXT, reason_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_excluded_item_ids UUID[];
  v_excluded_author_ids UUID[];
  v_result_ids UUID[] := '{}';
  v_result_types TEXT[] := '{}';
  v_result_reasons TEXT[] := '{}';
  v_pos INT := 0;
  v_author_counts JSONB := '{}';
  v_count INT;
  v_author_id UUID;
  v_reason TEXT;
  v_item_type TEXT;
BEGIN
  -- 1) 排除：近期看过、举报过的帖子与作者
  SELECT COALESCE(array_agg(DISTINCT vh.item_id), '{}')
  INTO v_excluded_item_ids
  FROM view_history vh
  WHERE vh.user_id = p_user_id
    AND vh.item_type = 'post'
    AND vh.viewed_at >= (NOW() - (p_exclude_viewed_days || ' days')::INTERVAL);

  SELECT COALESCE(array_agg(DISTINCT r.reported_id), '{}')
  INTO v_excluded_author_ids
  FROM reports r
  WHERE r.reporter_id = p_user_id AND r.reported_type = 'user';

  v_excluded_item_ids := COALESCE(v_excluded_item_ids, '{}') || COALESCE(
    (SELECT array_agg(DISTINCT r.reported_id) FROM reports r WHERE r.reporter_id = p_user_id AND r.reported_type = 'post'),
    '{}'
  );
  v_excluded_author_ids := COALESCE(v_excluded_author_ids, '{}');

  IF p_followed_only THEN
    -- Following 页：只返回关注人的帖子
    RETURN QUERY
    SELECT r.id AS item_id, r.item_type, 'followed_user'::TEXT AS reason_type
    FROM (
      SELECT 
        p.id,
        'post'::TEXT AS item_type,
        (p_tier1_base
         + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
         + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
         + COALESCE(p.tip_amount, 0) * 0.01
        ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
      FROM posts p
      INNER JOIN follows f ON f.followee_id = p.user_id AND f.follower_id = p_user_id
      WHERE p.status = 'approved'
        AND (p.id = ANY(v_excluded_item_ids) IS FALSE OR v_excluded_item_ids IS NULL)
        AND (p.user_id = ANY(v_excluded_author_ids) IS FALSE OR v_excluded_author_ids IS NULL)
      
      ORDER BY scr DESC NULLS LAST
      LIMIT (p_limit + p_offset) * 3
    ) r
    OFFSET p_offset
    LIMIT p_limit;
    RETURN;
  ELSE
  -- 主 Feed：Tier1 / Tier2 / Tier3
  DECLARE
    v_candidate RECORD;
  BEGIN
    FOR v_candidate IN
      WITH
      excluded AS (
        SELECT unnest(v_excluded_item_ids) AS id
        UNION
        SELECT p.id FROM posts p WHERE p.user_id = ANY(v_excluded_author_ids)
      ),
      -- Tier 1: 关注用户的帖子
      tier1_posts AS (
        SELECT p.id, p.user_id AS author_id, 'post'::TEXT AS item_type, 'followed_user'::TEXT AS rtype,
               (p_tier1_base
                + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
                + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
                + COALESCE(p.tip_amount, 0) * 0.01
               ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
        FROM posts p
        INNER JOIN follows f ON f.followee_id = p.user_id AND f.follower_id = p_user_id
        WHERE p.status = 'approved' AND p.id NOT IN (SELECT id FROM excluded)
      ),
      -- Tier 2: 关注话题的帖子
      tier2 AS (
        SELECT p.id, p.user_id AS author_id, 'post'::TEXT AS item_type, 'followed_topic'::TEXT AS rtype,
               (p_tier2_base
                + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
                + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
                + COALESCE(p.tip_amount, 0) * 0.01
               ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
        FROM posts p
        INNER JOIN post_topics pt ON pt.post_id = p.id
        INNER JOIN topic_follows tf ON tf.topic_id = pt.topic_id AND tf.user_id = p_user_id
        WHERE p.status = 'approved' AND p.id NOT IN (SELECT id FROM excluded)
          AND p.id NOT IN (SELECT id FROM tier1_posts)
      ),
      -- Tier 3: 热门帖子
      tier3_posts AS (
        SELECT p.id, p.user_id AS author_id, 'post'::TEXT AS item_type, 'trending'::TEXT AS rtype,
               (0
                + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
                + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
                + COALESCE(p.tip_amount, 0) * 0.01
               ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
        FROM posts p
        WHERE p.status = 'approved' AND p.id NOT IN (SELECT id FROM excluded)
          AND p.id NOT IN (SELECT id FROM tier1_posts)
          AND p.id NOT IN (SELECT id FROM tier2)
      ),
      -- 互动过的作者
      interacted_authors AS (
        SELECT p.user_id FROM posts p INNER JOIN likes l ON l.post_id = p.id WHERE l.user_id = p_user_id
        UNION
        SELECT p.user_id FROM posts p INNER JOIN comments c ON c.post_id = p.id WHERE c.user_id = p_user_id
        UNION
        SELECT p.user_id FROM posts p INNER JOIN tips t ON t.post_id = p.id WHERE t.tipper_id = p_user_id
      ),
      -- 合并所有层级
      combined AS (
        SELECT c.id, c.author_id, c.item_type, c.rtype,
               c.scr + CASE WHEN EXISTS (SELECT 1 FROM interacted_authors ia WHERE ia.user_id = c.author_id) THEN 15 ELSE 0 END AS scr
        FROM (
          SELECT id, author_id, item_type, rtype, scr FROM tier1_posts
          UNION ALL SELECT id, author_id, item_type, rtype, scr FROM tier2
          UNION ALL SELECT id, author_id, item_type, rtype, scr FROM tier3_posts
        ) c
      )
      SELECT c.id AS pid, c.author_id AS uid, c.item_type AS itype, c.rtype, c.scr
      FROM combined c
      ORDER BY c.scr DESC NULLS LAST
      LIMIT (p_limit + p_offset) * 4
    LOOP
      v_pos := v_pos + 1;
      IF v_pos <= p_offset THEN CONTINUE; END IF;
      IF array_length(v_result_ids, 1) >= p_limit THEN EXIT; END IF;
      IF array_length(v_result_ids, 1) < p_diversity_n THEN
        v_count := COALESCE((v_author_counts ->> v_candidate.uid::TEXT)::INT, 0);
        IF v_count >= p_diversity_k THEN CONTINUE; END IF;
        v_author_counts := jsonb_set(
          COALESCE(v_author_counts, '{}'),
          ARRAY[v_candidate.uid::TEXT],
          to_jsonb((v_count + 1)::INT)
        );
      END IF;
      v_result_ids := array_append(v_result_ids, v_candidate.pid);
      v_result_types := array_append(v_result_types, v_candidate.itype);
      v_result_reasons := array_append(v_result_reasons, v_candidate.rtype);
    END LOOP;
    
    -- 返回结果
    RETURN QUERY
    SELECT 
      unnest(v_result_ids) AS item_id,
      unnest(v_result_types) AS item_type,
      unnest(v_result_reasons) AS reason_type;
  END;
  END IF;
END;
$$;

-- 添加函数注释
COMMENT ON FUNCTION public.get_unified_feed_with_reasons IS '统一的 Feed RPC，只查询 posts 表';

-- 授予执行权限
GRANT EXECUTE ON FUNCTION public.get_unified_feed_with_reasons TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unified_feed_with_reasons TO anon;
