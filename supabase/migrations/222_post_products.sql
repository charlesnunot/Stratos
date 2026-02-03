-- 阶段3 社区功能：帖子内嵌商品关联表
-- post_products: 帖子可关联多个商品（讨论购买体验、分享商品）

CREATE TABLE IF NOT EXISTS public.post_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_post_products_post_id ON public.post_products(post_id);
CREATE INDEX IF NOT EXISTS idx_post_products_product_id ON public.post_products(product_id);

ALTER TABLE public.post_products ENABLE ROW LEVEL SECURITY;

-- 可见性：帖子为 approved 或当前用户为帖子作者时可读
CREATE POLICY post_products_select
  ON public.post_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_products.post_id
        AND (p.status = 'approved' OR p.user_id = auth.uid())
    )
  );

-- 仅帖子作者可增删改
CREATE POLICY post_products_insert
  ON public.post_products FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_products.post_id AND p.user_id = auth.uid())
  );

CREATE POLICY post_products_update
  ON public.post_products FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_products.post_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_products.post_id AND p.user_id = auth.uid())
  );

CREATE POLICY post_products_delete
  ON public.post_products FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_products.post_id AND p.user_id = auth.uid())
  );

COMMENT ON TABLE public.post_products IS 'Posts can link to products (e.g. purchase experience, product share). One post can link multiple products.';
