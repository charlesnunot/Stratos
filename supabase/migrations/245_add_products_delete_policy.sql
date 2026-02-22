-- 允许卖家删除自己的商品，admin/support 可删除任意商品
CREATE POLICY "Sellers can delete own products" ON products
  FOR DELETE
  USING (
    auth.uid() = seller_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'support')
    )
  );

COMMENT ON POLICY "Sellers can delete own products" ON products IS '卖家可删除自己的商品，管理员可删除任意商品';