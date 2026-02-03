-- Affiliate products RLS: allow read for display (e.g. product cards show commission_rate),
-- allow insert only for authenticated affiliates (subscription checked in API; RLS enforces affiliate_id = auth.uid()).

CREATE POLICY "Users can view affiliate products"
  ON affiliate_products
  FOR SELECT
  USING (true);

CREATE POLICY "Affiliates can create affiliate products"
  ON affiliate_products
  FOR INSERT
  WITH CHECK (
    auth.uid() = affiliate_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND subscription_type = 'affiliate'
    )
  );
