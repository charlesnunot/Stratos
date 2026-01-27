-- Add status field and soft disable mechanism for platform payment accounts
-- This migration adds status management to prevent accidental deletion of platform accounts
-- Status: 'active' | 'disabled'
-- Allows multiple disabled accounts but only one active account per payment type

-- ============================================
-- 1. Add status field
-- ============================================

-- Add status column with default value 'active'
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
  CHECK (status IN ('active', 'disabled'));

-- Set default status for existing records
UPDATE payment_accounts
SET status = 'active'
WHERE status IS NULL;

-- ============================================
-- 2. Add audit fields (for tracking enable/disable operations)
-- ============================================

-- Disabled timestamp
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

-- Disabled by (user who disabled the account)
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES profiles(id);

-- Enabled timestamp (for tracking re-enable operations)
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS enabled_at TIMESTAMPTZ;

-- Enabled by (user who enabled the account)
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS enabled_by UUID REFERENCES profiles(id);

-- ============================================
-- 3. Update unique index to only apply to active accounts
-- ============================================

-- Drop old unique index
DROP INDEX IF EXISTS idx_platform_payment_account_unique;

-- Create new unique index: only active accounts have uniqueness constraint
-- This allows multiple disabled accounts but only one active account per payment type
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_payment_account_unique_active
  ON payment_accounts(account_type) 
  WHERE is_platform_account = true 
    AND status = 'active';

-- ============================================
-- 4. Update get_platform_payment_account() function to only return active accounts
-- ============================================

CREATE OR REPLACE FUNCTION get_platform_payment_account(
  p_currency TEXT,
  p_account_type TEXT
)
RETURNS TABLE (
  id UUID,
  account_type TEXT,
  currency TEXT,
  account_info JSONB,
  is_verified BOOLEAN,
  supported_currencies TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id,
    pa.account_type,
    pa.currency,
    pa.account_info,
    pa.is_verified,
    pa.supported_currencies
  FROM payment_accounts pa
  WHERE pa.is_platform_account = true
    AND pa.account_type = p_account_type
    AND pa.is_verified = true
    AND pa.status = 'active'  -- ⭐ Only return active accounts
    AND (
      pa.currency = p_currency 
      OR p_currency = ANY(pa.supported_currencies)
    )
  ORDER BY 
    CASE WHEN pa.currency = p_currency THEN 0 ELSE 1 END,
    pa.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Add index for efficient status queries
-- ============================================

-- Index for status field on platform accounts
CREATE INDEX IF NOT EXISTS idx_payment_accounts_status 
  ON payment_accounts(status) 
  WHERE is_platform_account = true;

-- ============================================
-- Comments
-- ============================================

COMMENT ON COLUMN payment_accounts.status IS 'Account status: active (usable) or disabled (soft deleted, preserved for audit)';
COMMENT ON COLUMN payment_accounts.disabled_at IS 'Timestamp when account was disabled';
COMMENT ON COLUMN payment_accounts.disabled_by IS 'User ID who disabled the account';
COMMENT ON COLUMN payment_accounts.enabled_at IS 'Timestamp when account was enabled (or re-enabled)';
COMMENT ON COLUMN payment_accounts.enabled_by IS 'User ID who enabled the account';
