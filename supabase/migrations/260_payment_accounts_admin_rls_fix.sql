-- Migration 260: Fix Payment Accounts RLS for Admin Access
-- ============================================================
-- Purpose: Allow admin users to view all payment accounts (both platform and seller accounts)
-- Problem: Previous RLS policy only allowed users to view their own accounts or platform accounts
--          Admins could not see other sellers' payment accounts in the admin dashboard
-- ============================================================

-- ============================================================
-- Step 1: Update payment_accounts SELECT policy
-- ============================================================

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "payment_accounts_select" ON payment_accounts;

-- Create new SELECT policy that allows admin to view all accounts
CREATE POLICY "payment_accounts_select" ON payment_accounts
  FOR SELECT
  TO authenticated
  USING (
    is_platform_account = true
    OR seller_id = auth.uid()
    OR public.is_admin_or_support()  -- Admin/support can view all accounts
  );

-- ============================================================
-- Step 2: Update payment_accounts UPDATE policy (if needed for admin)
-- ============================================================

-- Drop the existing UPDATE platform policy
DROP POLICY IF EXISTS "payment_accounts_update_platform" ON payment_accounts;

-- Create new UPDATE policy for platform accounts that allows admin to update
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

-- ============================================================
-- Step 3: Add comment explaining the change
-- ============================================================

COMMENT ON POLICY "payment_accounts_select" ON payment_accounts IS 
'Allows: (1) platform accounts visible to all authenticated users; (2) users can view their own seller accounts; (3) admin/support can view ALL accounts (both platform and seller accounts for verification purposes)';

-- ============================================================
-- Step 4: Migration complete
-- ============================================================

-- Add migration log if cron_logs table exists and has details column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'cron_logs'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cron_logs' AND column_name = 'details'
  ) THEN
    INSERT INTO cron_logs (job_name, status, details)
    VALUES ('migration_260', 'success', jsonb_build_object(
      'description', 'Fixed payment_accounts RLS to allow admin access',
      'changes', ARRAY[
        'Updated payment_accounts_select policy to allow admin/support to view all accounts',
        'Updated payment_accounts_update_platform policy for consistency'
      ]
    ));
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Silently ignore if cron_logs table doesn't have the expected structure
  NULL;
END $$;
