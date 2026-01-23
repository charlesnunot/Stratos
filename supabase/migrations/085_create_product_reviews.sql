-- Create product_reviews table
-- Purchase-gated reviews on products (rating + optional content/images).

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content TEXT,
  image_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_id ON public.product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_order_id ON public.product_reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_rating ON public.product_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created_at ON public.product_reviews(created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_product_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_reviews_updated_at ON public.product_reviews;
CREATE TRIGGER trigger_update_product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_reviews_updated_at();

-- Enable Row Level Security
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view approved product reviews; owners/admin/support can view their own regardless.
CREATE POLICY "Users can view approved product reviews"
ON public.product_reviews FOR SELECT
USING (
  status = 'approved'
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'support')
  )
);

-- Buyers can create reviews only for orders they own that match the product.
-- Also restrict to shipped/completed orders.
CREATE POLICY "Buyers can create product reviews for their orders"
ON public.product_reviews FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_id
      AND o.buyer_id = auth.uid()
      AND o.product_id = product_id
      AND o.order_status IN ('shipped', 'completed')
  )
);

-- Authors or admin/support can update
CREATE POLICY "Users can update own product reviews"
ON public.product_reviews FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'support')
  )
);

-- Authors or admin can delete
CREATE POLICY "Users can delete own product reviews"
ON public.product_reviews FOR DELETE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

