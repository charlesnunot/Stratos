-- Migration 258: Unified Subscription Sync Function
-- ============================================================
-- Purpose: Fix the conflict between migration 256 and 257 by creating a unified
-- sync function that supports multiple subscription types while maintaining
-- the 3-tier seller subscription system from migration 257.
-- ============================================================

-- ============================================================
-- Step 0: Add missing columns if they don't exist
-- ============================================================

-- Seller subscription fields
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS seller_subscription_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS seller_subscription_expires_at TIMESTAMPTZ;

-- Affiliate subscription fields  
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS affiliate_subscription_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS affiliate_subscription_expires_at TIMESTAMPTZ;

-- Tip subscription fields
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tip_subscription_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tip_subscription_expires_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN profiles.seller_subscription_active IS 'Whether user has active seller subscription (auto-synced from subscriptions table)';
COMMENT ON COLUMN profiles.seller_subscription_expires_at IS 'Expiration date of seller subscription (auto-synced from subscriptions table)';
COMMENT ON COLUMN profiles.affiliate_subscription_active IS 'Whether user has active affiliate subscription (auto-synced from subscriptions table)';
COMMENT ON COLUMN profiles.affiliate_subscription_expires_at IS 'Expiration date of affiliate subscription (auto-synced from subscriptions table)';
COMMENT ON COLUMN profiles.tip_subscription_active IS 'Whether user has active tip subscription (auto-synced from subscriptions table)';
COMMENT ON COLUMN profiles.tip_subscription_expires_at IS 'Expiration date of tip subscription (auto-synced from subscriptions table)';

-- ============================================================
-- Step 1: Create unified sync function
-- ============================================================

CREATE OR REPLACE FUNCTION sync_profile_subscription_derived(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_seller_tier DECIMAL;
  v_user_origin TEXT;
  v_internal_tip BOOLEAN;
  v_tip_enabled_from_sub BOOLEAN;
  v_product_limit INTEGER;
  v_seller_type TEXT;
  v_seller_subscription_active BOOLEAN;
  v_seller_subscription_expires_at TIMESTAMPTZ;
  v_affiliate_subscription_active BOOLEAN;
  v_affiliate_subscription_expires_at TIMESTAMPTZ;
  v_tip_subscription_active BOOLEAN;
  v_tip_subscription_expires_at TIMESTAMPTZ;
BEGIN
  -- Get user origin and internal flags for tip_enabled merge logic
  SELECT user_origin, COALESCE(internal_tip_enabled, false), seller_type
  INTO v_user_origin, v_internal_tip, v_seller_type
  FROM profiles
  WHERE id = p_user_id;

  -- Check if user is a direct seller (no subscription required)
  IF v_seller_type = 'direct' THEN
    -- Direct sellers have unlimited product limits and no subscription requirements
    UPDATE profiles
    SET 
      seller_subscription_active = true,
      seller_subscription_expires_at = NULL,
      seller_subscription_tier = NULL,
      product_limit = 999999,
      subscription_type = 'seller',
      subscription_expires_at = NULL,
      role = 'seller',
      updated_at = v_now
    WHERE id = p_user_id;
    RETURN;
  END IF;

  -- Calculate seller subscription status (from migration 256)
  SELECT 
    EXISTS(SELECT 1 FROM subscriptions 
           WHERE user_id = p_user_id 
             AND subscription_type = 'seller' 
             AND status IN ('active', 'cancelled')
             AND expires_at > v_now),
    (SELECT MAX(expires_at) FROM subscriptions 
     WHERE user_id = p_user_id 
       AND subscription_type = 'seller' 
       AND status IN ('active', 'cancelled'))
  INTO v_seller_subscription_active, v_seller_subscription_expires_at;

  -- Get max seller tier and product limit (from migration 257)
  SELECT 
    COALESCE(MAX(subscription_tier), NULL),
    COALESCE(MAX(product_limit), 0)
  INTO v_seller_tier, v_product_limit
  FROM subscriptions
  WHERE user_id = p_user_id
    AND subscription_type = 'seller'
    AND status IN ('active', 'cancelled')
    AND expires_at > v_now;

  -- Calculate affiliate subscription status (from migration 256)
  SELECT 
    EXISTS(SELECT 1 FROM subscriptions 
           WHERE user_id = p_user_id 
             AND subscription_type = 'affiliate' 
             AND status IN ('active', 'cancelled')
             AND expires_at > v_now),
    (SELECT MAX(expires_at) FROM subscriptions 
     WHERE user_id = p_user_id 
       AND subscription_type = 'affiliate' 
       AND status IN ('active', 'cancelled'))
  INTO v_affiliate_subscription_active, v_affiliate_subscription_expires_at;

  -- Calculate tip subscription status (from migration 256)
  SELECT 
    EXISTS(SELECT 1 FROM subscriptions 
           WHERE user_id = p_user_id 
             AND subscription_type = 'tip' 
             AND status IN ('active', 'cancelled')
             AND expires_at > v_now)
  INTO v_tip_enabled_from_sub;

  SELECT (SELECT MAX(expires_at) FROM subscriptions 
          WHERE user_id = p_user_id 
            AND subscription_type = 'tip' 
            AND status IN ('active', 'cancelled'))
  INTO v_tip_subscription_expires_at;

  -- Update profile with all calculated values
  UPDATE profiles
  SET
    -- Seller fields (combined from 256 and 257)
    seller_subscription_active = COALESCE(v_seller_subscription_active, false),
    seller_subscription_expires_at = v_seller_subscription_expires_at,
    seller_subscription_tier = v_seller_tier,
    product_limit = COALESCE(v_product_limit, 0),
    
    -- Affiliate fields (from migration 256)
    affiliate_subscription_active = COALESCE(v_affiliate_subscription_active, false),
    affiliate_subscription_expires_at = v_affiliate_subscription_expires_at,
    
    -- Tip fields (merge with internal setting for internal users)
    tip_subscription_active = COALESCE(v_tip_enabled_from_sub, false),
    tip_subscription_expires_at = v_tip_subscription_expires_at,
    tip_enabled = CASE
      WHEN v_user_origin = 'internal' THEN (v_internal_tip OR COALESCE(v_tip_enabled_from_sub, false))
      ELSE COALESCE(v_tip_enabled_from_sub, false)
    END,
    
    -- Legacy fields (for backward compatibility)
    subscription_type = CASE
      WHEN v_seller_subscription_active THEN 'seller'
      WHEN v_affiliate_subscription_active THEN 'affiliate'
      WHEN v_tip_enabled_from_sub THEN 'tip'
      ELSE NULL
    END,
    subscription_expires_at = GREATEST(
      v_seller_subscription_expires_at,
      v_affiliate_subscription_expires_at,
      v_tip_subscription_expires_at
    ),
    subscription_tier = v_seller_tier,
    
    -- Role update
    role = CASE
      WHEN v_seller_subscription_active THEN 'seller'
      WHEN v_affiliate_subscription_active THEN 'affiliate'
      ELSE role
    END,
    
    updated_at = v_now
  WHERE id = p_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_profile_subscription_derived(UUID) IS 
'Unified subscription sync function combining features from migrations 256 and 257. Supports multiple simultaneous subscriptions and 3-tier seller system.';

-- ============================================================
-- Step 2: Update trigger function to use unified sync
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_sync_profile_subscription()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM sync_profile_subscription_derived(NEW.user_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM sync_profile_subscription_derived(OLD.user_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS sync_profile_subscription_trigger ON subscriptions;
DROP TRIGGER IF EXISTS trg_subscription_change ON subscriptions;

-- Create unified trigger
CREATE TRIGGER sync_profile_subscription_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_profile_subscription();

COMMENT ON TRIGGER sync_profile_subscription_trigger ON subscriptions IS 
'Automatically sync profile subscription fields when subscriptions change (unified version)';

-- ============================================================
-- Step 3: Backfill existing data with unified sync
-- ============================================================

-- Sync all existing profiles
DO $$
DECLARE
  v_user_id UUID;
  v_count INT := 0;
BEGIN
  FOR v_user_id IN SELECT id FROM profiles WHERE id IN (SELECT DISTINCT user_id FROM subscriptions)
  LOOP
    PERFORM sync_profile_subscription_derived(v_user_id);
    v_count := v_count + 1;
  END LOOP;
  
  -- Log completion (skip if cron_logs doesn't have details column)
  -- INSERT INTO cron_logs (job_name, status, details)
  -- VALUES ('migration_258_backfill', 'success', jsonb_build_object('profiles_synced', v_count));
END $$;

-- ============================================================
-- Step 4: Create admin API for manual sync
-- ============================================================

-- Create function for admin to manually sync a user
CREATE OR REPLACE FUNCTION admin_sync_user_subscription(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM sync_profile_subscription_derived(p_user_id);
  
  -- Return sync status
  SELECT jsonb_build_object(
    'user_id', p_user_id,
    'synced_at', NOW(),
    'status', 'success'
  ) INTO v_result;
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'user_id', p_user_id,
      'synced_at', NOW(),
      'status', 'error',
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_sync_user_subscription(UUID) IS 
'Admin function to manually sync user subscription status. Returns sync result.';

-- ============================================================
-- Step 5: Add data consistency check function
-- ============================================================

CREATE OR REPLACE FUNCTION check_subscription_consistency(p_user_id UUID)
RETURNS TABLE (
  check_item TEXT,
  status TEXT,
  details TEXT
) AS $$
DECLARE
  v_profile RECORD;
  v_subscription_count INT;
  v_seller_subscription_count INT;
  v_affiliate_subscription_count INT;
  v_tip_subscription_count INT;
BEGIN
  -- Get profile data
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  
  -- Count active subscriptions
  SELECT COUNT(*) INTO v_subscription_count
  FROM subscriptions 
  WHERE user_id = p_user_id 
    AND status IN ('active', 'cancelled')
    AND expires_at > NOW();
    
  SELECT COUNT(*) INTO v_seller_subscription_count
  FROM subscriptions 
  WHERE user_id = p_user_id 
    AND subscription_type = 'seller'
    AND status IN ('active', 'cancelled')
    AND expires_at > NOW();
    
  SELECT COUNT(*) INTO v_affiliate_subscription_count
  FROM subscriptions 
  WHERE user_id = p_user_id 
    AND subscription_type = 'affiliate'
    AND status IN ('active', 'cancelled')
    AND expires_at > NOW();
    
  SELECT COUNT(*) INTO v_tip_subscription_count
  FROM subscriptions 
  WHERE user_id = p_user_id 
    AND subscription_type = 'tip'
    AND status IN ('active', 'cancelled')
    AND expires_at > NOW();

  -- Check 1: Seller subscription consistency
  IF v_seller_subscription_count > 0 AND NOT v_profile.seller_subscription_active THEN
    RETURN QUERY SELECT 
      'Seller subscription sync'::TEXT,
      'INCONSISTENT'::TEXT,
      'Active seller subscription exists but profile shows inactive'::TEXT;
  ELSE
    RETURN QUERY SELECT 
      'Seller subscription sync'::TEXT,
      'CONSISTENT'::TEXT,
      'Seller subscription status matches'::TEXT;
  END IF;

  -- Check 2: Affiliate subscription consistency
  IF v_affiliate_subscription_count > 0 AND NOT v_profile.affiliate_subscription_active THEN
    RETURN QUERY SELECT 
      'Affiliate subscription sync'::TEXT,
      'INCONSISTENT'::TEXT,
      'Active affiliate subscription exists but profile shows inactive'::TEXT;
  ELSE
    RETURN QUERY SELECT 
      'Affiliate subscription sync'::TEXT,
      'CONSISTENT'::TEXT,
      'Affiliate subscription status matches'::TEXT;
  END IF;

  -- Check 3: Tip subscription consistency
  IF v_tip_subscription_count > 0 AND NOT v_profile.tip_subscription_active THEN
    RETURN QUERY SELECT 
      'Tip subscription sync'::TEXT,
      'INCONSISTENT'::TEXT,
      'Active tip subscription exists but profile shows inactive'::TEXT;
  ELSE
    RETURN QUERY SELECT 
      'Tip subscription sync'::TEXT,
      'CONSISTENT'::TEXT,
      'Tip subscription status matches'::TEXT;
  END IF;

  -- Check 4: Product limit consistency
  IF v_profile.seller_subscription_active AND v_profile.product_limit = 0 THEN
    RETURN QUERY SELECT 
      'Product limit sync'::TEXT,
      'INCONSISTENT'::TEXT,
      'Seller is active but product limit is 0'::TEXT;
  ELSE
    RETURN QUERY SELECT 
      'Product limit sync'::TEXT,
      'CONSISTENT'::TEXT,
      'Product limit properly set'::TEXT;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_subscription_consistency(UUID) IS 
'Check consistency between subscriptions and profiles tables for a given user.';

-- ============================================================
-- Step 6: Migration complete
-- ============================================================

-- Add migration log (skip if cron_logs doesn't have details column)
-- INSERT INTO cron_logs (job_name, status, details)
-- VALUES ('migration_258', 'success', jsonb_build_object(
--   'description', 'Unified subscription sync function resolving conflicts between migrations 256 and 257',
--   'features', ARRAY[
--     'Multiple simultaneous subscription support',
--     '3-tier seller subscription system',
--     'Direct seller support',
--     'Data consistency checks',
--     'Admin sync functions'
--   ]
-- ));