-- 个性化 Feed RPC：综合分（Tier1+100/Tier2+50/Tier3+0）+ engagement + recency，排除已看/举报，简单多样性
-- 权重通过参数传入，由调用方从 env/settings 读取，实现配置化

CREATE OR REPLACE FUNCTION public.get_personalized_feed(
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
RETURNS TABLE(post_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_excluded_post_ids UUID[];
  v_excluded_author_ids UUID[];
  v_candidate RECORD;
  v_result UUID[] := '{}';
  v_pos INT := 0;
  v_author_counts JSONB := '{}';
  v_count INT;
  v_author_id UUID;
BEGIN
  -- 1) 排除：近期看过的帖子、用户举报过的帖子、用户举报过的作者发的帖子
  SELECT COALESCE(array_agg(DISTINCT vh.item_id), '{}')
  INTO v_excluded_post_ids
  FROM view_history vh
  WHERE vh.user_id = p_user_id
    AND vh.item_type = 'post'
    AND vh.viewed_at >= (NOW() - (p_exclude_viewed_days || ' days')::INTERVAL);

  SELECT COALESCE(array_agg(DISTINCT r.reported_id), '{}')
  INTO v_excluded_author_ids
  FROM reports r
  WHERE r.reporter_id = p_user_id AND r.reported_type = 'user';

  v_excluded_post_ids := COALESCE(v_excluded_post_ids, '{}') || COALESCE(
    (SELECT array_agg(DISTINCT r.reported_id) FROM reports r WHERE r.reporter_id = p_user_id AND r.reported_type = 'post'),
    '{}'
  );
  v_excluded_author_ids := COALESCE(v_excluded_author_ids, '{}');

  -- 2) 构建候选并排序：Tier1(关注人) / Tier2(关注话题) / Tier3(其余)，综合分 = tier_base + engagement * recency
  IF p_followed_only THEN
    -- Following 页：只返回关注人的帖子，按时间+互动
    FOR v_candidate IN
      SELECT p.id AS pid, p.user_id AS uid,
             (p_tier1_base
              + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
              + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
              + COALESCE(p.tip_amount, 0) * 0.01
             ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
      FROM posts p
      INNER JOIN follows f ON f.followee_id = p.user_id AND f.follower_id = p_user_id
      WHERE p.status = 'approved'
        AND (p.id = ANY(v_excluded_post_ids) IS FALSE OR v_excluded_post_ids IS NULL)
        AND (p.user_id = ANY(v_excluded_author_ids) IS FALSE OR v_excluded_author_ids IS NULL)
      ORDER BY scr DESC NULLS LAST, p.created_at DESC
      LIMIT (p_limit + p_offset) * 3
    LOOP
      v_pos := v_pos + 1;
      IF v_pos > p_offset AND array_length(v_result, 1) < p_limit THEN
        v_result := v_result || v_candidate.pid;
      END IF;
      EXIT WHEN v_pos >= p_offset + p_limit;
    END LOOP;
  ELSE
    -- 主 Feed：Tier1 + Tier2 + Tier3 综合分，再应用多样性（前 p_diversity_n 条中同一作者最多 p_diversity_k 次）
    FOR v_candidate IN
      WITH
      excluded AS (
        SELECT unnest(v_excluded_post_ids) AS id
        UNION
        SELECT p.id FROM posts p WHERE p.user_id = ANY(v_excluded_author_ids)
      ),
      tier1 AS (
        SELECT p.id, p.user_id,
               (p_tier1_base
                + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
                + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
                + COALESCE(p.tip_amount, 0) * 0.01
               ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
        FROM posts p
        INNER JOIN follows f ON f.followee_id = p.user_id AND f.follower_id = p_user_id
        WHERE p.status = 'approved' AND p.id NOT IN (SELECT id FROM excluded)
      ),
      tier2 AS (
        SELECT p.id, p.user_id,
               (p_tier2_base
                + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
                + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
                + COALESCE(p.tip_amount, 0) * 0.01
               ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
        FROM posts p
        INNER JOIN post_topics pt ON pt.post_id = p.id
        INNER JOIN topic_follows tf ON tf.topic_id = pt.topic_id AND tf.user_id = p_user_id
        WHERE p.status = 'approved' AND p.id NOT IN (SELECT id FROM excluded)
          AND p.id NOT IN (SELECT tier1.id FROM tier1)
      ),
      tier3 AS (
        SELECT p.id, p.user_id,
               (0
                + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
                + LN(1 + GREATEST(COALESCE(p.comment_count, 0), 0))
                + COALESCE(p.tip_amount, 0) * 0.01
               ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
        FROM posts p
        WHERE p.status = 'approved' AND p.id NOT IN (SELECT id FROM excluded)
          AND p.id NOT IN (SELECT tier1.id FROM tier1)
          AND p.id NOT IN (SELECT tier2.id FROM tier2)
      ),
      interacted_authors AS (
        SELECT p.user_id FROM posts p INNER JOIN likes l ON l.post_id = p.id WHERE l.user_id = p_user_id
        UNION
        SELECT p.user_id FROM posts p INNER JOIN comments c ON c.post_id = p.id WHERE c.user_id = p_user_id
        UNION
        SELECT p.user_id FROM posts p INNER JOIN tips t ON t.post_id = p.id WHERE t.tipper_id = p_user_id
      ),
      combined AS (
        SELECT c.id, c.user_id,
               c.scr + CASE WHEN EXISTS (SELECT 1 FROM interacted_authors ia WHERE ia.user_id = c.user_id) THEN 15 ELSE 0 END AS scr
        FROM (
          SELECT id, user_id, scr FROM tier1
          UNION ALL SELECT id, user_id, scr FROM tier2
          UNION ALL SELECT id, user_id, scr FROM tier3
        ) c
      )
      SELECT c.id AS pid, c.user_id AS uid, c.scr
      FROM combined c
      ORDER BY c.scr DESC NULLS LAST
      LIMIT (p_limit + p_offset) * 4
    LOOP
      v_pos := v_pos + 1;
      IF v_pos <= p_offset THEN
        CONTINUE;
      END IF;
      IF array_length(v_result, 1) >= p_limit THEN
        EXIT;
      END IF;
      -- 多样性：前 p_diversity_n 条中同一作者最多 p_diversity_k 次
      IF array_length(v_result, 1) < p_diversity_n THEN
        v_count := COALESCE((v_author_counts ->> v_candidate.uid::TEXT)::INT, 0);
        IF v_count >= p_diversity_k THEN
          -- 跳过此条，不增加 v_pos 对 result 的贡献，但已占用一个候选位，所以继续下一候选
          CONTINUE;
        END IF;
        v_author_counts := jsonb_set(
          COALESCE(v_author_counts, '{}'),
          ARRAY[v_candidate.uid::TEXT],
          to_jsonb((v_count + 1)::INT)
        );
      END IF;
      v_result := v_result || v_candidate.pid;
    END LOOP;
  END IF;

  -- 3) 返回 post_id 集合（按顺序）
  RETURN QUERY SELECT unnest(v_result) AS post_id;
END;
$$;

COMMENT ON FUNCTION public.get_personalized_feed(UUID, INT, INT, BOOLEAN, INT, NUMERIC, NUMERIC, INT, INT)
  IS 'Personalized feed: Tier1(followed)+Tier2(topic)+Tier3(rest), score=tier_base+engagement*recency, exclude viewed/reported, diversity in first N. Weights via params (configurable from env).';
