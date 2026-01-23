-- Basic rate limits for social actions (DB-level guardrails)
-- Goal: prevent accidental spam / runaway clicks from inflating data.
-- Note: these limits are conservative and can be tuned later.

-- 1) Limit shares per user+item in a short window
CREATE OR REPLACE FUNCTION public.enforce_share_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- Allow at most 5 shares per (user_id, item_type, item_id) within 60 seconds
  SELECT COUNT(*) INTO recent_count
  FROM public.shares
  WHERE user_id = NEW.user_id
    AND item_type = NEW.item_type
    AND item_id = NEW.item_id
    AND created_at > NOW() - INTERVAL '60 seconds';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded for shares'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_share_rate_limit ON public.shares;
CREATE TRIGGER trigger_enforce_share_rate_limit
  BEFORE INSERT ON public.shares
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_share_rate_limit();

-- 2) Limit comment creation per user in a short window
CREATE OR REPLACE FUNCTION public.enforce_comment_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  -- Allow at most 10 comments per user within 60 seconds
  SELECT COUNT(*) INTO recent_count
  FROM public.comments
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '60 seconds';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded for comments'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_comment_rate_limit ON public.comments;
CREATE TRIGGER trigger_enforce_comment_rate_limit
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_comment_rate_limit();

