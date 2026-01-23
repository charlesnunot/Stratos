-- Add topic follow support
-- - topic_follows table
-- - trigger to update topics.follower_count

CREATE TABLE IF NOT EXISTS public.topic_follows (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_follows_topic_id ON public.topic_follows(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_follows_user_id ON public.topic_follows(user_id);

ALTER TABLE public.topic_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view topic follows" ON public.topic_follows;
CREATE POLICY "Anyone can view topic follows" ON public.topic_follows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own topic follows" ON public.topic_follows;
CREATE POLICY "Users can insert their own topic follows" ON public.topic_follows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own topic follows" ON public.topic_follows;
CREATE POLICY "Users can delete their own topic follows" ON public.topic_follows
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_topic_follower_count()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_topic_follower_count ON public.topic_follows;
CREATE TRIGGER trigger_update_topic_follower_count
  AFTER INSERT OR DELETE ON public.topic_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_topic_follower_count();

