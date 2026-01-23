-- Extend payment_accounts table for seller payment account management
-- Support for Alipay, WeChat Pay, and Stripe Connect accounts

-- Extend payment_accounts table with additional fields
ALTER TABLE payment_accounts
  ADD COLUMN IF NOT EXISTS account_name TEXT, -- Display name for the account
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired')),
  ADD COLUMN IF NOT EXISTS verification_documents JSONB DEFAULT '{}'::jsonb, -- Store verification documents
  ADD COLUMN IF NOT EXISTS verification_notes TEXT, -- Admin notes on verification
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id);

-- Update account_info structure to support different payment providers
-- account_info JSONB structure:
-- {
--   "alipay": {
--     "account": "alipay_account_number",
--     "real_name": "real_name"
--   },
--   "wechat": {
--     "mch_id": "merchant_id",
--     "app_id": "app_id"
--   },
--   "stripe": {
--     "account_id": "stripe_connect_account_id",
--     "payout_currency": "USD"
--   },
--   "paypal": {
--     "email": "paypal_email",
--     "currency": "USD"
--   },
--   "bank": {
--     "account_number": "bank_account",
--     "bank_name": "bank_name",
--     "swift_code": "swift_code"
--   }
-- }

-- Function to get seller's payment account for a specific currency
CREATE OR REPLACE FUNCTION get_seller_payment_account(
  p_seller_id UUID,
  p_currency TEXT,
  p_account_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  account_type TEXT,
  currency TEXT,
  account_info JSONB,
  is_default BOOLEAN,
  is_verified BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id,
    pa.account_type,
    pa.currency,
    pa.account_info,
    pa.is_default,
    pa.is_verified
  FROM payment_accounts pa
  WHERE pa.seller_id = p_seller_id
    AND pa.is_verified = true
    AND (
      pa.currency = p_currency 
      OR p_currency = ANY(pa.supported_currencies)
    )
    AND (p_account_type IS NULL OR pa.account_type = p_account_type)
  ORDER BY pa.is_default DESC, pa.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify payment account
CREATE OR REPLACE FUNCTION verify_payment_account(
  p_account_id UUID,
  p_verified_by UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE payment_accounts
  SET 
    verification_status = p_status,
    is_verified = (p_status = 'verified'),
    verified_at = CASE WHEN p_status = 'verified' THEN NOW() ELSE verified_at END,
    verified_by = p_verified_by,
    verification_notes = p_notes
  WHERE id = p_account_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index for efficient account lookups
CREATE INDEX IF NOT EXISTS idx_payment_accounts_seller_currency 
  ON payment_accounts(seller_id, currency, is_verified);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_seller_type 
  ON payment_accounts(seller_id, account_type, is_verified);
