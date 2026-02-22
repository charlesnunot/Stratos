-- Feed 曝光日志：便于 Phase 2 算 CTR、验证推荐效果
-- Phase 1 可只写不读

CREATE TABLE IF NOT EXISTS public.feed_impressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_impressions_user_id ON public.feed_impressions(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_impressions_post_id ON public.feed_impressions(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_impressions_shown_at ON public.feed_impressions(shown_at DESC);

ALTER TABLE public.feed_impressions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feed_impressions' AND schemaname = 'public' AND policyname = 'Users can insert own feed_impressions') THEN
    CREATE POLICY "Users can insert own feed_impressions"
      ON public.feed_impressions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feed_impressions' AND schemaname = 'public' AND policyname = 'Users can view own feed_impressions') THEN
    CREATE POLICY "Users can view own feed_impressions"
      ON public.feed_impressions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON TABLE public.feed_impressions IS 'Feed exposure log for CTR and recommendation evaluation (Phase 2).';
