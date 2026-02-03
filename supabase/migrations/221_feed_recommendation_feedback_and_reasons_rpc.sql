-- 阶段2 社区功能：推荐反馈表 + 带推荐理由的 Feed RPC
-- feed_recommendation_feedback: 用户对 Feed 推荐条目的同意/不同意/忽略反馈
-- get_personalized_feed_with_reasons: 与 get_personalized_feed 逻辑一致，额外返回 reason_type（followed_user / followed_topic / trending）

-- 1) 推荐反馈表
CREATE TABLE IF NOT EXISTS public.feed_recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reason_type TEXT,
  agreed BOOLEAN,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE OR REPLACE FUNCTION public.set_feed_recommendation_feedback_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS feed_recommendation_feedback_updated_at ON public.feed_recommendation_feedback;
CREATE TRIGGER feed_recommendation_feedback_updated_at
  BEFORE UPDATE ON public.feed_recommendation_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_feed_recommendation_feedback_updated_at();

CREATE INDEX IF NOT EXISTS idx_feed_recommendation_feedback_user_id
  ON public.feed_recommendation_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_recommendation_feedback_post_id
  ON public.feed_recommendation_feedback(post_id);

ALTER TABLE public.feed_recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_recommendation_feedback_select_own
  ON public.feed_recommendation_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY feed_recommendation_feedback_insert_own
  ON public.feed_recommendation_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY feed_recommendation_feedback_update_own
  ON public.feed_recommendation_feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.feed_recommendation_feedback IS 'User feedback on feed recommendations: agreed (helpful), disagreed (not relevant), or dismissed (hide). One row per user per post.';

-- 2) 带推荐理由的个性化 Feed RPC（返回 post_id + reason_type）
CREATE OR REPLACE FUNCTION public.get_personalized_feed_with_reasons(
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
RETURNS TABLE(post_id UUID, reason_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_excluded_post_ids UUID[];
  v_excluded_author_ids UUID[];
  v_result_ids UUID[] := '{}';
  v_result_reasons TEXT[] := '{}';
  v_pos INT := 0;
  v_author_counts JSONB := '{}';
  v_count INT;
  v_author_id UUID;
  v_reason TEXT;
BEGIN
  -- 排除：近期看过、举报过的帖子与作者
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

  IF p_followed_only THEN
    -- Following 页：只返回关注人的帖子，reason_type = followed_user
    RETURN QUERY
    SELECT r.id AS post_id, 'followed_user'::TEXT AS reason_type
    FROM (
      SELECT p.id,
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
    ) r
    OFFSET p_offset
    LIMIT p_limit;
    RETURN;
  ELSE
  -- 主 Feed：Tier1 / Tier2 / Tier3，带 reason_type，与 get_personalized_feed 相同的循环与多样性逻辑
  DECLARE
    v_candidate RECORD;
  BEGIN
    FOR v_candidate IN
      WITH
      excluded AS (
        SELECT unnest(v_excluded_post_ids) AS id
        UNION
        SELECT p.id FROM posts p WHERE p.user_id = ANY(v_excluded_author_ids)
      ),
      tier1 AS (
        SELECT p.id, p.user_id, 'followed_user'::TEXT AS rtype,
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
        SELECT p.id, p.user_id, 'followed_topic'::TEXT AS rtype,
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
        SELECT p.id, p.user_id, 'trending'::TEXT AS rtype,
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
        SELECT c.id, c.user_id, c.rtype,
               c.scr + CASE WHEN EXISTS (SELECT 1 FROM interacted_authors ia WHERE ia.user_id = c.user_id) THEN 15 ELSE 0 END AS scr
        FROM (
          SELECT id, user_id, rtype, scr FROM tier1
          UNION ALL SELECT id, user_id, rtype, scr FROM tier2
          UNION ALL SELECT id, user_id, rtype, scr FROM tier3
        ) c
      )
      SELECT c.id AS pid, c.user_id AS uid, c.rtype, c.scr
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
      v_result_ids := v_result_ids || v_candidate.pid;
      v_result_reasons := v_result_reasons || COALESCE(v_candidate.rtype, 'trending');
    END LOOP;
    RETURN QUERY SELECT unnest(v_result_ids) AS post_id, unnest(v_result_reasons) AS reason_type;
  END;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_personalized_feed_with_reasons(UUID, INT, INT, BOOLEAN, INT, NUMERIC, NUMERIC, INT, INT)
  IS 'Same as get_personalized_feed but returns (post_id, reason_type). reason_type: followed_user, followed_topic, trending.';
