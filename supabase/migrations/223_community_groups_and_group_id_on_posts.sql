-- 阶段1 兴趣小组：community_groups、group_members、帖子可选 group_id

-- 1) 小组表
CREATE TABLE IF NOT EXISTS public.community_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_groups_slug ON public.community_groups(slug);
CREATE INDEX IF NOT EXISTS idx_community_groups_created_by ON public.community_groups(created_by);

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_groups_select
  ON public.community_groups FOR SELECT
  USING (true);

CREATE POLICY community_groups_insert
  ON public.community_groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY community_groups_update
  ON public.community_groups FOR UPDATE
  USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = community_groups.id AND gm.user_id = auth.uid() AND gm.role = 'admin')
  )
  WITH CHECK (true);

CREATE POLICY community_groups_delete
  ON public.community_groups FOR DELETE
  USING (auth.uid() = created_by);

COMMENT ON TABLE public.community_groups IS 'Interest groups: users can join, post in group.';

CREATE OR REPLACE FUNCTION public.set_community_groups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS community_groups_updated_at ON public.community_groups;
CREATE TRIGGER community_groups_updated_at
  BEFORE UPDATE ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_community_groups_updated_at();

-- 2) 小组成员表
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_members_select
  ON public.group_members FOR SELECT
  USING (true);

CREATE POLICY group_members_insert
  ON public.group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY group_members_update
  ON public.group_members FOR UPDATE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role IN ('admin', 'moderator')
  ));

CREATE POLICY group_members_delete
  ON public.group_members FOR DELETE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.community_groups g WHERE g.id = group_members.group_id AND g.created_by = auth.uid()
  ));

COMMENT ON TABLE public.group_members IS 'Group membership: admin, moderator, member.';

-- 3) 小组 member_count 触发器
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_groups SET member_count = member_count + 1, updated_at = now() WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_groups SET member_count = GREATEST(0, member_count - 1), updated_at = now() WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_group_member_count ON public.group_members;
CREATE TRIGGER trigger_update_group_member_count
  AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.update_group_member_count();

-- 4) posts 表增加可选 group_id
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.community_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_group_id ON public.posts(group_id) WHERE group_id IS NOT NULL;

COMMENT ON COLUMN public.posts.group_id IS 'Optional: post belongs to this community group.';

-- 5) 创建小组时自动插入创建者为 admin
CREATE OR REPLACE FUNCTION public.add_creator_as_group_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_add_creator_as_group_admin ON public.community_groups;
CREATE TRIGGER trigger_add_creator_as_group_admin
  AFTER INSERT ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_group_admin();

-- 注意：member_count 在 trigger 里 +1 是插入 group_members 时触发，创建者先 INSERT group 再由本 trigger 插入 group_members，所以 member_count 会正确 +1