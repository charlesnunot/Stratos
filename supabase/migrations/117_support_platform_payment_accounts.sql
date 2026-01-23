-- Support platform payment accounts
-- Allow payment_accounts to support platform accounts (seller_id can be NULL)
-- Add is_platform_account flag and related constraints

-- Allow seller_id to be NULL for platform accounts
ALTER TABLE payment_accounts 
  ALTER COLUMN seller_id DROP NOT NULL;

-- Add platform account identifier
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS is_platform_account BOOLEAN DEFAULT false;

-- Add constraint: platform accounts must have seller_id as NULL, user accounts must have seller_id as NOT NULL
ALTER TABLE payment_accounts
  DROP CONSTRAINT IF EXISTS check_platform_account_seller_id;

ALTER TABLE payment_accounts
  ADD CONSTRAINT check_platform_account_seller_id 
  CHECK (
    (is_platform_account = true AND seller_id IS NULL) OR
    (is_platform_account = false AND seller_id IS NOT NULL)
  );

-- Create unique constraint: each payment type can only have one platform account
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_payment_account_unique 
  ON payment_accounts(account_type) 
  WHERE is_platform_account = true;

-- Function to get platform payment account for a specific currency and account type
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

-- Index for efficient platform account lookups
CREATE INDEX IF NOT EXISTS idx_payment_accounts_platform 
  ON payment_accounts(is_platform_account, account_type, currency, is_verified)
  WHERE is_platform_account = true;
