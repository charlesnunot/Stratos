-- RLS policies for payment_accounts
-- Enables: (1) admins to manage platform accounts; (2) users (sellers) to manage their own accounts.
-- Table had RLS enabled in 001 but no policies, so all access was denied.

-- Helper: admin or support role
CREATE OR REPLACE FUNCTION public.is_admin_or_support()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'support')
  );
$$;

-- SELECT: platform accounts visible to all authenticated (for checkout/config); own seller accounts to owner
DROP POLICY IF EXISTS "payment_accounts_select" ON payment_accounts;
CREATE POLICY "payment_accounts_select" ON payment_accounts
  FOR SELECT
  TO authenticated
  USING (
    is_platform_account = true
    OR seller_id = auth.uid()
  );

-- INSERT platform: only admin/support, and must be platform row
DROP POLICY IF EXISTS "payment_accounts_insert_platform" ON payment_accounts;
CREATE POLICY "payment_accounts_insert_platform" ON payment_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_platform_account = true
    AND seller_id IS NULL
    AND public.is_admin_or_support()
  );

-- INSERT seller: user can only insert own seller account
DROP POLICY IF EXISTS "payment_accounts_insert_seller" ON payment_accounts;
CREATE POLICY "payment_accounts_insert_seller" ON payment_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_platform_account = false
    AND seller_id = auth.uid()
  );

-- UPDATE platform: only admin/support
DROP POLICY IF EXISTS "payment_accounts_update_platform" ON payment_accounts;
CREATE POLICY "payment_accounts_update_platform" ON payment_accounts
  FOR UPDATE
  TO authenticated
  USING (
    is_platform_account = true
    AND seller_id IS NULL
    AND public.is_admin_or_support()
  )
  WITH CHECK (
    is_platform_account = true
    AND seller_id IS NULL
  );

-- UPDATE seller: only own row
DROP POLICY IF EXISTS "payment_accounts_update_seller" ON payment_accounts;
CREATE POLICY "payment_accounts_update_seller" ON payment_accounts
  FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- DELETE platform: only admin/support
DROP POLICY IF EXISTS "payment_accounts_delete_platform" ON payment_accounts;
CREATE POLICY "payment_accounts_delete_platform" ON payment_accounts
  FOR DELETE
  TO authenticated
  USING (
    is_platform_account = true
    AND seller_id IS NULL
    AND public.is_admin_or_support()
  );

-- DELETE seller: only own row
DROP POLICY IF EXISTS "payment_accounts_delete_seller" ON payment_accounts;
CREATE POLICY "payment_accounts_delete_seller" ON payment_accounts
  FOR DELETE
  TO authenticated
  USING (seller_id = auth.uid());

COMMENT ON FUNCTION public.is_admin_or_support() IS 'Returns true if current user has admin or support role; used by payment_accounts RLS';
