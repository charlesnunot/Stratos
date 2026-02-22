-- Migration 261: Fix Payment Account Verification - Sync profiles table
-- ============================================================
-- Problem: When admin verifies a payment account, only payment_accounts table is updated
--          The profiles table (payment_provider, payment_account_id) is not synced
--          This causes seller dashboard to show "未绑定收款方式" even after verification
-- ============================================================

-- ============================================================
-- Step 1: Update verify_payment_account function to sync profiles table
-- ============================================================

CREATE OR REPLACE FUNCTION verify_payment_account(
  p_account_id UUID,
  p_verified_by UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_seller_id UUID;
  v_account_type TEXT;
  v_is_verified BOOLEAN;
BEGIN
  -- Get account info before update
  SELECT seller_id, account_type, is_verified
  INTO v_seller_id, v_account_type, v_is_verified
  FROM payment_accounts
  WHERE id = p_account_id;

  -- Update payment_accounts table
  UPDATE payment_accounts
  SET 
    verification_status = p_status,
    is_verified = (p_status = 'verified'),
    verified_at = CASE WHEN p_status = 'verified' THEN NOW() ELSE verified_at END,
    verified_by = p_verified_by,
    verification_notes = p_notes
  WHERE id = p_account_id;

  -- If verification is successful and status changed to verified, update profiles table
  IF p_status = 'verified' AND v_seller_id IS NOT NULL AND NOT v_is_verified THEN
    UPDATE profiles
    SET 
      payment_provider = v_account_type,
      payment_account_id = p_account_id,
      seller_payout_eligibility = 'eligible',
      updated_at = NOW()
    WHERE id = v_seller_id;
  END IF;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION verify_payment_account(UUID, UUID, TEXT, TEXT) IS 
'Verifies a payment account and syncs the status to profiles table. When verified, updates profiles.payment_provider, profiles.payment_account_id, and sets seller_payout_eligibility to eligible.';

-- ============================================================
-- Step 2: Sync existing verified accounts to profiles
-- ============================================================

-- Update profiles table for all verified payment accounts that are not yet synced
UPDATE profiles p
SET 
  payment_provider = pa.account_type,
  payment_account_id = pa.id,
  seller_payout_eligibility = 'eligible',
  updated_at = NOW()
FROM payment_accounts pa
WHERE pa.seller_id = p.id
  AND pa.verification_status = 'verified'
  AND pa.is_verified = true
  AND (p.payment_provider IS NULL OR p.payment_account_id IS NULL);

-- ============================================================
-- Step 3: Add trigger to auto-sync profiles when payment account is verified
-- ============================================================

-- Function to sync profiles when payment account is verified
CREATE OR REPLACE FUNCTION sync_profile_on_payment_account_verification()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync when status changes to verified
  IF NEW.verification_status = 'verified' 
     AND NEW.is_verified = true 
     AND NEW.seller_id IS NOT NULL
     AND (OLD.verification_status != 'verified' OR OLD.is_verified != true) THEN
    
    UPDATE profiles
    SET 
      payment_provider = NEW.account_type,
      payment_account_id = NEW.id,
      seller_payout_eligibility = 'eligible',
      updated_at = NOW()
    WHERE id = NEW.seller_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_profile_on_payment_account_verification ON payment_accounts;

-- Create trigger
CREATE TRIGGER trg_sync_profile_on_payment_account_verification
  AFTER UPDATE ON payment_accounts
  FOR EACH ROW
  WHEN (NEW.verification_status = 'verified' AND NEW.is_verified = true)
  EXECUTE FUNCTION sync_profile_on_payment_account_verification();

COMMENT ON FUNCTION sync_profile_on_payment_account_verification() IS 
'Automatically syncs profiles table when a payment account is verified';

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
    VALUES ('migration_261', 'success', jsonb_build_object(
      'description', 'Fixed payment account verification sync to profiles table',
      'changes', ARRAY[
        'Updated verify_payment_account function to sync profiles table',
        'Synced existing verified accounts to profiles',
        'Added trigger to auto-sync on verification'
      ]
    ));
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Silently ignore if cron_logs table doesn't have the expected structure
  NULL;
END $$;
