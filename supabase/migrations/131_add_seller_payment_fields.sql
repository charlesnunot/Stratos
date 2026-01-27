-- Add seller payment account fields to profiles table
-- Implements buyer-to-seller direct payment model
-- Platform only validates, directs, and records - does not handle funds

-- ============================================
-- 1. Add seller payment account fields to profiles table
-- ============================================

-- Base fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_provider TEXT CHECK (payment_provider IN ('stripe', 'paypal', 'alipay', 'wechat', 'bank')),
  ADD COLUMN IF NOT EXISTS payment_account_id TEXT;

-- Provider status fields (read-only cache from payment providers)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS provider_charges_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_payouts_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_account_status TEXT CHECK (provider_account_status IN ('enabled', 'restricted', 'pending', 'disabled'));

-- Platform-side business judgment (single source of truth)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seller_payout_eligibility TEXT CHECK (seller_payout_eligibility IN ('eligible', 'blocked', 'pending_review'));

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_profiles_payment_provider ON profiles(payment_provider) WHERE payment_provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_payment_account_id ON profiles(payment_account_id) WHERE payment_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_seller_payout_eligibility ON profiles(seller_payout_eligibility) WHERE seller_payout_eligibility IS NOT NULL;

-- Add comments
COMMENT ON COLUMN profiles.payment_provider IS 'Payment provider: stripe, paypal, alipay, wechat, or bank';
COMMENT ON COLUMN profiles.payment_account_id IS 'Payment provider account ID (e.g., Stripe Connect account ID)';
COMMENT ON COLUMN profiles.provider_charges_enabled IS 'Stripe charges_enabled status (read-only cache from provider)';
COMMENT ON COLUMN profiles.provider_payouts_enabled IS 'Stripe payouts_enabled status (read-only cache from provider)';
COMMENT ON COLUMN profiles.provider_account_status IS 'Raw account status from payment provider: enabled, restricted, pending, disabled (read-only cache)';
COMMENT ON COLUMN profiles.seller_payout_eligibility IS 'Platform-calculated payout eligibility: eligible, blocked, pending_review (single source of truth for business logic)';

-- ============================================
-- 2. Add status snapshot fields to orders table
-- ============================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_payout_eligibility_at_order_creation TEXT CHECK (seller_payout_eligibility_at_order_creation IN ('eligible', 'blocked', 'pending_review')),
  ADD COLUMN IF NOT EXISTS seller_payment_provider_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS seller_payment_account_id_snapshot TEXT;

-- Add comments
COMMENT ON COLUMN orders.seller_payout_eligibility_at_order_creation IS 'Snapshot of seller_payout_eligibility at order creation time (for audit and appeals)';
COMMENT ON COLUMN orders.seller_payment_provider_snapshot IS 'Snapshot of payment_provider at order creation time (for audit and appeals)';
COMMENT ON COLUMN orders.seller_payment_account_id_snapshot IS 'Snapshot of payment_account_id at order creation time (for audit and appeals)';

-- ============================================
-- 3. Create function to calculate seller payout eligibility
-- ============================================

CREATE OR REPLACE FUNCTION calculate_seller_payout_eligibility(
  p_seller_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_subscription_valid BOOLEAN := false;
  v_has_payment_account BOOLEAN := false;
  v_provider_ready BOOLEAN := false;
  v_eligibility TEXT;
BEGIN
  -- Check 1: Subscription is valid
  SELECT EXISTS(
    SELECT 1
    FROM subscriptions
    WHERE user_id = p_seller_id
      AND subscription_type = 'seller'
      AND status = 'active'
      AND expires_at > NOW()
  ) INTO v_subscription_valid;

  IF NOT v_subscription_valid THEN
    RETURN 'blocked';
  END IF;

  -- Check 2: Payment account is bound
  SELECT EXISTS(
    SELECT 1
    FROM profiles
    WHERE id = p_seller_id
      AND payment_provider IS NOT NULL
      AND payment_account_id IS NOT NULL
  ) INTO v_has_payment_account;

  IF NOT v_has_payment_account THEN
    RETURN 'pending_review';
  END IF;

  -- Check 3: Provider account is ready (for Stripe)
  SELECT 
    CASE 
      WHEN payment_provider = 'stripe' THEN
        (provider_charges_enabled = true AND provider_payouts_enabled = true)
      WHEN payment_provider IN ('paypal', 'alipay', 'wechat') THEN
        (provider_account_status = 'enabled')
      WHEN payment_provider = 'bank' THEN
        true -- Bank transfers don't have provider status
      ELSE false
    END
  INTO v_provider_ready
  FROM profiles
  WHERE id = p_seller_id;

  IF NOT v_provider_ready THEN
    RETURN 'pending_review';
  END IF;

  -- Check 4: Account is not restricted
  IF EXISTS(
    SELECT 1
    FROM profiles
    WHERE id = p_seller_id
      AND provider_account_status = 'restricted'
  ) THEN
    RETURN 'blocked';
  END IF;

  -- All checks passed
  RETURN 'eligible';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_seller_payout_eligibility IS 'Calculate seller payout eligibility based on subscription, payment account, and provider status. Returns: eligible, blocked, or pending_review';

-- ============================================
-- 4. Create function to update seller payout eligibility (physical lock)
-- ============================================

CREATE OR REPLACE FUNCTION update_seller_payout_eligibility(
  p_seller_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_eligibility TEXT;
BEGIN
  -- Calculate eligibility
  SELECT calculate_seller_payout_eligibility(p_seller_id) INTO v_eligibility;
  
  -- Update profiles table
  UPDATE profiles
  SET seller_payout_eligibility = v_eligibility,
      updated_at = NOW()
  WHERE id = p_seller_id;
  
  RETURN v_eligibility;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_seller_payout_eligibility IS 'Update seller_payout_eligibility by recalculating. This is the ONLY way to update seller_payout_eligibility (physical lock). Direct UPDATE is prohibited.';

-- ============================================
-- 5. Create helper function to get seller payment account info
-- ============================================

CREATE OR REPLACE FUNCTION get_seller_payment_account_info(
  p_seller_id UUID
)
RETURNS TABLE (
  payment_provider TEXT,
  payment_account_id TEXT,
  provider_charges_enabled BOOLEAN,
  provider_payouts_enabled BOOLEAN,
  provider_account_status TEXT,
  seller_payout_eligibility TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.payment_provider,
    p.payment_account_id,
    p.provider_charges_enabled,
    p.provider_payouts_enabled,
    p.provider_account_status,
    p.seller_payout_eligibility
  FROM profiles p
  WHERE p.id = p_seller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_seller_payment_account_info IS 'Get seller payment account information for validation';
