-- 阶段3 积分发放：RPC 增加积分 + 发帖（故事/音乐/短视频）审核通过时自动加分并可选授章

-- 1) RPC：为指定用户增加积分（由 trigger 或应用层调用，需 SECURITY DEFINER）
CREATE OR REPLACE FUNCTION public.add_user_points(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.user_points (user_id, points)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET points = public.user_points.points + p_amount,
      updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.add_user_points(UUID, INT, TEXT) IS 'Add points to user. Used by triggers or app/cron.';

-- 2) 发帖审核通过时：若为故事/音乐/短视频则加积分，并首次授予对应徽章
CREATE OR REPLACE FUNCTION public.award_points_and_badge_on_post_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_type TEXT;
  v_points INT := 0;
  v_badge_key TEXT;
  v_badge_id UUID;
  v_has_badge BOOLEAN;
BEGIN
  -- 仅当 status 变为 approved 时处理（INSERT 且 status=approved，或 UPDATE 且 status 从非 approved 变为 approved）
  IF (TG_OP = 'INSERT' AND NEW.status <> 'approved') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND (OLD.status = 'approved' OR NEW.status <> 'approved')) THEN
    RETURN NEW;
  END IF;

  v_post_type := COALESCE(NEW.post_type, 'normal');

  -- 仅对故事/音乐/短视频加分
  IF v_post_type = 'story' THEN
    v_points := 5;
    v_badge_key := 'story_creator';
  ELSIF v_post_type = 'music' THEN
    v_points := 5;
    v_badge_key := 'music_creator';
  ELSIF v_post_type = 'short_video' THEN
    v_points := 5;
    v_badge_key := 'short_video_creator';
  ELSE
    RETURN NEW;
  END IF;

  IF v_points > 0 THEN
    PERFORM public.add_user_points(NEW.user_id, v_points, 'post_approved_' || v_post_type);
  END IF;

  -- 首次授予徽章：检查是否已有该徽章
  SELECT id INTO v_badge_id FROM public.badges WHERE key = v_badge_key LIMIT 1;
  IF v_badge_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_badges WHERE user_id = NEW.user_id AND badge_id = v_badge_id
    ) INTO v_has_badge;
    IF NOT v_has_badge THEN
      INSERT INTO public.user_badges (user_id, badge_id) VALUES (NEW.user_id, v_badge_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_award_points_and_badge_on_post_approved ON public.posts;
CREATE TRIGGER trigger_award_points_and_badge_on_post_approved
  AFTER INSERT OR UPDATE OF status
  ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.award_points_and_badge_on_post_approved();

COMMENT ON FUNCTION public.award_points_and_badge_on_post_approved() IS 'On post approved: award points and first-time badge for story/music/short_video.';
