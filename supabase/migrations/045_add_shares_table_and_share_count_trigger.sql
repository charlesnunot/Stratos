-- Add shares table and share_count triggers for posts/products
-- Goal: make share_count updates concurrency-safe and server-authoritative.

-- 1) shares table
CREATE TABLE IF NOT EXISTS public.shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'product')),
  item_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shares_user_id ON public.shares(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_item_type_id ON public.shares(item_type, item_id);

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view shares" ON public.shares;
CREATE POLICY "Anyone can view shares" ON public.shares
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own shares" ON public.shares;
CREATE POLICY "Users can insert their own shares" ON public.shares
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own shares" ON public.shares;
CREATE POLICY "Users can delete their own shares" ON public.shares
  FOR DELETE USING (auth.uid() = user_id);

-- 2) trigger to update share_count
CREATE OR REPLACE FUNCTION public.update_item_share_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_type = 'post' THEN
      UPDATE public.posts
      SET share_count = share_count + 1
      WHERE id = NEW.item_id;
    ELSIF NEW.item_type = 'product' THEN
      UPDATE public.products
      SET share_count = share_count + 1
      WHERE id = NEW.item_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_type = 'post' THEN
      UPDATE public.posts
      SET share_count = GREATEST(0, share_count - 1)
      WHERE id = OLD.item_id;
    ELSIF OLD.item_type = 'product' THEN
      UPDATE public.products
      SET share_count = GREATEST(0, share_count - 1)
      WHERE id = OLD.item_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_item_share_count ON public.shares;
CREATE TRIGGER trigger_update_item_share_count
  AFTER INSERT OR DELETE ON public.shares
  FOR EACH ROW
  EXECUTE FUNCTION public.update_item_share_count();

