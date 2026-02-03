-- 触发器内 UPDATE topics 被 RLS 拒绝（topics 无 UPDATE 策略），导致关注者数不更新。
-- 将触发器函数改为 SECURITY DEFINER，以定义者权限执行，仅更新 follower_count，不开放用户 UPDATE topics。

CREATE OR REPLACE FUNCTION public.update_topic_follower_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.topics
    SET follower_count = follower_count + 1
    WHERE id = NEW.topic_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.topics
    SET follower_count = GREATEST(0, follower_count - 1)
    WHERE id = OLD.topic_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.update_topic_follower_count() IS 'Updates topics.follower_count on topic_follows insert/delete; SECURITY DEFINER to bypass RLS.';

-- 一次性按 topic_follows 重新计算 follower_count，修复此前因 RLS 导致未更新的数据
UPDATE public.topics t
SET follower_count = COALESCE(c.cnt, 0)
FROM (
  SELECT topic_id, COUNT(*)::int AS cnt
  FROM public.topic_follows
  GROUP BY topic_id
) c
WHERE t.id = c.topic_id AND t.follower_count IS DISTINCT FROM c.cnt;
