-- 阶段4 用户成长体系：积分、等级（由积分计算）、徽章

-- 1) 用户积分表（一条记录 per user，upsert 更新）
CREATE TABLE IF NOT EXISTS public.user_points (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points INT NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_user_points_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_points_updated_at ON public.user_points;
CREATE TRIGGER user_points_updated_at
  BEFORE UPDATE ON public.user_points
  FOR EACH ROW EXECUTE FUNCTION public.set_user_points_updated_at();

ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_points_select_own
  ON public.user_points FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY user_points_insert_own
  ON public.user_points FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_points_update_own
  ON public.user_points FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 仅服务端/定时任务增加积分时使用；应用层通过 service role 或 RPC 更新
COMMENT ON TABLE public.user_points IS 'User points for growth system. Level can be derived from points (e.g. 0-99 L1, 100-499 L2).';

-- 2) 徽章定义表（只读，管理员可维护）
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY badges_select_all
  ON public.badges FOR SELECT
  USING (true);

COMMENT ON TABLE public.badges IS 'Badge definitions. Assign via user_badges.';

-- 3) 用户已获得徽章
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON public.user_badges(user_id);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_badges_select_all
  ON public.user_badges FOR SELECT
  USING (true);

-- 授予徽章由服务端/管理员执行
CREATE POLICY user_badges_insert_service
  ON public.user_badges FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.user_badges IS 'Badges earned by users.';

-- 4) 等级由积分计算：提供函数 level_from_points(points)
CREATE OR REPLACE FUNCTION public.level_from_points(p_points INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_points < 100 THEN 1
    WHEN p_points < 500 THEN 2
    WHEN p_points < 2000 THEN 3
    WHEN p_points < 5000 THEN 4
    WHEN p_points < 10000 THEN 5
    ELSE LEAST(10, 5 + (p_points / 10000)::INT)
  END;
$$;

COMMENT ON FUNCTION public.level_from_points(INT) IS 'Maps points to level 1-10+.';