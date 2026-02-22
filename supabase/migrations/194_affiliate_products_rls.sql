-- Affiliate products RLS: allow read for display (e.g. product cards show commission_rate),
-- allow insert only for authenticated affiliates (subscription checked in API; RLS enforces affiliate_id = auth.uid()).

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'affiliate_products' AND policyname = 'Users can view affiliate products') THEN
    CREATE POLICY "Users can view affiliate products"
      ON affiliate_products
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'affiliate_products' AND policyname = 'Affiliates can create affiliate products') THEN
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
  END IF;
END $$;
