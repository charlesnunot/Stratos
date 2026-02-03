-- 商品个性化推荐 RPC：Tier1(关注卖家) / Tier2(互动分类，最低权重门槛) / Tier3(其余)
-- 排除：近期浏览、举报商品、举报卖家；打分：tier_base + engagement*recency，sales_count 限幅；多样性：前 N 条同卖家最多 k 条
-- 架构评审微调：Tier2 互动分类 HAVING SUM(score)>=8；sales_count 用 LN(1+.)；p_diversity_n=30,p_diversity_k=2；p_category 可选；view_history 复合索引

SET search_path = public;

-- view_history 热点优化：复合索引，只扫最近 X 天时高效
CREATE INDEX IF NOT EXISTS idx_view_history_user_type_viewed
  ON view_history (user_id, item_type, viewed_at DESC);

CREATE OR REPLACE FUNCTION public.get_personalized_product_feed(
  p_user_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_exclude_viewed_days INT DEFAULT 7,
  p_tier1_base NUMERIC DEFAULT 100,
  p_tier2_base NUMERIC DEFAULT 50,
  p_diversity_n INT DEFAULT 30,
  p_diversity_k INT DEFAULT 2,
  p_category TEXT DEFAULT NULL,
  p_category_interaction_min INT DEFAULT 8
)
RETURNS TABLE(product_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_excluded_product_ids UUID[] := '{}';
  v_excluded_seller_ids UUID[] := '{}';
  v_tier2_categories TEXT[] := '{}';
  v_candidate RECORD;
  v_result UUID[] := '{}';
  v_pos INT := 0;
  v_seller_counts JSONB := '{}';
  v_count INT;
BEGIN
  -- 1) 排除：近期看过的商品、用户举报过的商品、用户举报过的卖家的商品
  SELECT COALESCE(array_agg(DISTINCT vh.item_id), '{}')
  INTO v_excluded_product_ids
  FROM view_history vh
  WHERE vh.user_id = p_user_id
    AND vh.item_type = 'product'
    AND vh.viewed_at >= (NOW() - (p_exclude_viewed_days || ' days')::INTERVAL);

  SELECT COALESCE(array_agg(DISTINCT r.reported_id), '{}')
  INTO v_excluded_seller_ids
  FROM reports r
  WHERE r.reporter_id = p_user_id AND r.reported_type = 'user';

  v_excluded_product_ids := COALESCE(v_excluded_product_ids, '{}') || COALESCE(
    (SELECT array_agg(DISTINCT r.reported_id) FROM reports r WHERE r.reporter_id = p_user_id AND r.reported_type = 'product'),
    '{}'
  );
  v_excluded_seller_ids := COALESCE(v_excluded_seller_ids, '{}');

  -- 2) Tier2 互动分类：like=3, want=4, order=10, view=1，只保留 HAVING SUM(score) >= p_category_interaction_min
  SELECT COALESCE(array_agg(DISTINCT cat), '{}')
  INTO v_tier2_categories
  FROM (
    SELECT p.category AS cat
    FROM (
      SELECT product_id, 3 AS scr FROM product_likes WHERE user_id = p_user_id
      UNION ALL
      SELECT product_id, 4 FROM product_wants WHERE user_id = p_user_id
      UNION ALL
      SELECT item_id::UUID, 1 FROM view_history WHERE user_id = p_user_id AND item_type = 'product'
      UNION ALL
      SELECT oi.product_id, 10
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id AND o.buyer_id = p_user_id
      UNION ALL
      SELECT o.product_id, 10 FROM orders o WHERE o.buyer_id = p_user_id AND o.product_id IS NOT NULL
    ) u
    INNER JOIN products p ON p.id = u.product_id AND p.status = 'active' AND p.category IS NOT NULL
    GROUP BY p.category
    HAVING SUM(u.scr) >= p_category_interaction_min
  ) t(cat)
  WHERE cat IS NOT NULL;

  -- 3) 构建候选并排序：Tier1 / Tier2 / Tier3，综合分 = tier_base + engagement*recency，sales_count 用 LN(1+.) 限幅
  FOR v_candidate IN
    WITH
    excluded AS (
      SELECT unnest(v_excluded_product_ids) AS id
      UNION
      SELECT p.id FROM products p WHERE p.seller_id = ANY(v_excluded_seller_ids)
    ),
    tier1 AS (
      SELECT p.id, p.seller_id,
             (p_tier1_base
              + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
              + LN(1 + GREATEST(COALESCE(p.want_count, 0), 0))
              + LN(1 + GREATEST(COALESCE(p.favorite_count, 0), 0))
              + LN(1 + LEAST(GREATEST(COALESCE(p.sales_count, 0), 0), 100))
             ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
      FROM products p
      INNER JOIN follows f ON f.followee_id = p.seller_id AND f.follower_id = p_user_id
      WHERE p.status = 'active'
        AND p.id NOT IN (SELECT id FROM excluded)
        AND (p_category IS NULL OR p.category = p_category)
    ),
    tier2 AS (
      SELECT p.id, p.seller_id,
             (p_tier2_base
              + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
              + LN(1 + GREATEST(COALESCE(p.want_count, 0), 0))
              + LN(1 + GREATEST(COALESCE(p.favorite_count, 0), 0))
              + LN(1 + LEAST(GREATEST(COALESCE(p.sales_count, 0), 0), 100))
             ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
      FROM products p
      WHERE p.status = 'active'
        AND p.id NOT IN (SELECT id FROM excluded)
        AND p.category = ANY(v_tier2_categories)
        AND p.id NOT IN (SELECT tier1.id FROM tier1)
        AND (p_category IS NULL OR p.category = p_category)
    ),
    tier3 AS (
      SELECT p.id, p.seller_id,
             (0
              + LN(1 + GREATEST(COALESCE(p.like_count, 0), 0))
              + LN(1 + GREATEST(COALESCE(p.want_count, 0), 0))
              + LN(1 + GREATEST(COALESCE(p.favorite_count, 0), 0))
              + LN(1 + LEAST(GREATEST(COALESCE(p.sales_count, 0), 0), 100))
             ) * EXP(-0.029 * EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) AS scr
      FROM products p
      WHERE p.status = 'active'
        AND p.id NOT IN (SELECT id FROM excluded)
        AND p.id NOT IN (SELECT tier1.id FROM tier1)
        AND p.id NOT IN (SELECT tier2.id FROM tier2)
        AND (p_category IS NULL OR p.category = p_category)
    ),
    interacted_sellers AS (
      SELECT p.seller_id FROM product_likes pl INNER JOIN products p ON p.id = pl.product_id WHERE pl.user_id = p_user_id
      UNION
      SELECT p.seller_id FROM product_wants pw INNER JOIN products p ON p.id = pw.product_id WHERE pw.user_id = p_user_id
      UNION
      SELECT seller_id FROM orders WHERE buyer_id = p_user_id
    ),
    combined AS (
      SELECT c.id, c.seller_id,
             c.scr + CASE WHEN EXISTS (SELECT 1 FROM interacted_sellers i WHERE i.seller_id = c.seller_id) THEN 15 ELSE 0 END AS scr
      FROM (
        SELECT id, seller_id, scr FROM tier1
        UNION ALL SELECT id, seller_id, scr FROM tier2
        UNION ALL SELECT id, seller_id, scr FROM tier3
      ) c
    )
    SELECT c.id AS pid, c.seller_id AS sid, c.scr
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
    -- 多样性：前 p_diversity_n 条中同一卖家最多 p_diversity_k 条（默认 N=30, k=2）
    IF array_length(v_result, 1) < p_diversity_n THEN
      v_count := COALESCE((v_seller_counts ->> v_candidate.sid::TEXT)::INT, 0);
      IF v_count >= p_diversity_k THEN
        CONTINUE;
      END IF;
      v_seller_counts := jsonb_set(
        COALESCE(v_seller_counts, '{}'),
        ARRAY[v_candidate.sid::TEXT],
        to_jsonb((v_count + 1)::INT)
      );
    END IF;
    v_result := v_result || v_candidate.pid;
  END LOOP;

  RETURN QUERY SELECT unnest(v_result) AS product_id;
END;
$$;

COMMENT ON FUNCTION public.get_personalized_product_feed(UUID, INT, INT, INT, NUMERIC, NUMERIC, INT, INT, TEXT, INT)
  IS 'Product personalized feed: Tier1(followed sellers)+Tier2(interacted categories, min score 8)+Tier3(rest). Exclude viewed/reported. Score=tier_base+LN(engagement)*recency, sales_count capped. Diversity: first N=30, max k=2 per seller. Optional p_category.';
