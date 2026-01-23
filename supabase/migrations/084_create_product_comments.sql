-- Create product_comments table
-- Discussion-style comments on products (not purchase-gated).
-- Similar to social post comments, supports replies (2-level in UI), images, moderation status.

CREATE TABLE IF NOT EXISTS public.product_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES public.product_comments(id) ON DELETE CASCADE,
  image_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_comments_product_id ON public.product_comments(product_id);
CREATE INDEX IF NOT EXISTS idx_product_comments_user_id ON public.product_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_product_comments_parent_id ON public.product_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_product_comments_created_at ON public.product_comments(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.product_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can view approved product comments; owners/admin/support can view their own regardless.
CREATE POLICY "Users can view approved product comments"
ON public.product_comments FOR SELECT
USING (
  status = 'approved'
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'support')
  )
);

-- Logged-in users can create product comments for themselves
CREATE POLICY "Users can create product comments"
ON public.product_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Authors or admin/support can update
CREATE POLICY "Users can update own product comments"
ON public.product_comments FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'support')
  )
);

-- Authors or admin can delete
CREATE POLICY "Users can delete own product comments"
ON public.product_comments FOR DELETE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

