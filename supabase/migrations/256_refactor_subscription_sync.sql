-- Migration 256: Refactor Subscription Sync to Support Multiple Subscription Types
-- ============================================================
-- Purpose: Support users having multiple subscription types simultaneously
-- by replacing single subscription_type field with separate fields for each type
-- ============================================================

-- ============================================================
-- Step 1: Add new subscription status fields to profiles table
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
-- Step 2: Create comprehensive sync function
-- ============================================================

CREATE OR REPLACE FUNCTION sync_profile_subscription_derived(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_seller_tier DECIMAL;
  v_user_origin TEXT;
  v_internal_tip BOOLEAN;
  v_tip_enabled_from_sub BOOLEAN;
  v_seller_subscription_active BOOLEAN;
  v_seller_subscription_expires_at TIMESTAMPTZ;
  v_affiliate_subscription_active BOOLEAN;
  v_affiliate_subscription_expires_at TIMESTAMPTZ;
  v_tip_subscription_expires_at TIMESTAMPTZ;
BEGIN
  -- Get user origin and internal flags for tip_enabled merge logic
  SELECT user_origin, COALESCE(internal_tip_enabled, false)
  INTO v_user_origin, v_internal_tip
  FROM profiles
  WHERE id = p_user_id;

  -- Calculate seller subscription status
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

  -- Get max seller tier
  SELECT COALESCE(MAX(subscription_tier), NULL)
  INTO v_seller_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND subscription_type = 'seller'
    AND status IN ('active', 'cancelled')
    AND expires_at > v_now;

  -- Calculate affiliate subscription status
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

  -- Calculate tip subscription status
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
    -- Seller fields
    seller_subscription_active = COALESCE(seller_subscription_active, false),
    seller_subscription_expires_at = seller_subscription_expires_at,
    seller_subscription_tier = v_seller_tier,
    
    -- Affiliate fields
    affiliate_subscription_active = COALESCE(affiliate_subscription_active, false),
    affiliate_subscription_expires_at = affiliate_subscription_expires_at,
    
    -- Tip fields (merge with internal setting for internal users)
    tip_subscription_active = COALESCE(v_tip_enabled_from_sub, false),
    tip_subscription_expires_at = tip_subscription_expires_at,
    tip_enabled = CASE
      WHEN v_user_origin = 'internal' THEN (v_internal_tip OR COALESCE(v_tip_enabled_from_sub, false))
      ELSE COALESCE(v_tip_enabled_from_sub, false)
    END,
    
    -- Legacy fields (for backward compatibility)
    subscription_type = CASE
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'seller' AND status IN ('active', 'cancelled') AND expires_at > v_now) THEN 'seller'
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'affiliate' AND status IN ('active', 'cancelled') AND expires_at > v_now) THEN 'affiliate'
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'tip' AND status IN ('active', 'cancelled') AND expires_at > v_now) THEN 'tip'
      ELSE NULL
    END,
    subscription_expires_at = (SELECT MAX(expires_at) FROM subscriptions 
                               WHERE user_id = p_user_id 
                                 AND status IN ('active', 'cancelled')
                                 AND expires_at > v_now),
    
    -- Role update
    role = CASE
      WHEN v_seller_tier IS NOT NULL THEN 'seller'
      ELSE role
    END,
    
    updated_at = v_now
  WHERE id = p_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_profile_subscription_derived(UUID) IS 
'Sync profile subscription-derived fields from subscriptions table. Supports multiple simultaneous subscriptions. Internal users: tip_enabled = internal_tip_enabled OR subscription tip.';

-- ============================================================
-- Step 3: Create trigger function for automatic sync
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

-- Create new trigger
CREATE TRIGGER sync_profile_subscription_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_profile_subscription();

COMMENT ON TRIGGER sync_profile_subscription_trigger ON subscriptions IS 
'Automatically sync profile subscription fields when subscriptions change';

-- ============================================================
-- Step 4: Backfill existing data
-- ============================================================

-- Sync all existing profiles
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN SELECT id FROM profiles WHERE id IN (SELECT DISTINCT user_id FROM subscriptions)
  LOOP
    PERFORM sync_profile_subscription_derived(v_user_id);
  END LOOP;
END $$;

-- ============================================================
-- Step 5: Add RLS policies to protect subscription fields
-- ============================================================

-- Only allow system/admin to update subscription fields
CREATE POLICY "Only system can update subscription fields"
  ON profiles
  FOR UPDATE
  USING (true)
  WITH CHECK (
    -- Allow if no subscription fields are being changed
    (seller_subscription_active IS NOT DISTINCT FROM (SELECT seller_subscription_active FROM profiles WHERE id = auth.uid()))
    AND (seller_subscription_expires_at IS NOT DISTINCT FROM (SELECT seller_subscription_expires_at FROM profiles WHERE id = auth.uid()))
    AND (affiliate_subscription_active IS NOT DISTINCT FROM (SELECT affiliate_subscription_active FROM profiles WHERE id = auth.uid()))
    AND (affiliate_subscription_expires_at IS NOT DISTINCT FROM (SELECT affiliate_subscription_expires_at FROM profiles WHERE id = auth.uid()))
    AND (tip_subscription_active IS NOT DISTINCT FROM (SELECT tip_subscription_active FROM profiles WHERE id = auth.uid()))
    AND (tip_subscription_expires_at IS NOT DISTINCT FROM (SELECT tip_subscription_expires_at FROM profiles WHERE id = auth.uid()))
  );

-- ============================================================
-- Step 6: Add indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_seller_active ON profiles(seller_subscription_active) WHERE seller_subscription_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_affiliate_active ON profiles(affiliate_subscription_active) WHERE affiliate_subscription_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_tip_active ON profiles(tip_subscription_active) WHERE tip_subscription_active = true;

-- ============================================================
-- Step 7: Create daily sync cron job (for natural expirations)
-- ============================================================

-- Create function for daily sync
CREATE OR REPLACE FUNCTION daily_sync_all_profile_subscriptions()
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_count INT := 0;
BEGIN
  FOR v_user_id IN SELECT id FROM profiles 
                   WHERE seller_subscription_active = true 
                      OR affiliate_subscription_active = true 
                      OR tip_subscription_active = true
  LOOP
    PERFORM sync_profile_subscription_derived(v_user_id);
    v_count := v_count + 1;
  END LOOP;
  
  -- Log completion
  INSERT INTO cron_logs (job_name, status, details)
  VALUES ('daily_sync_all_profile_subscriptions', 'success', jsonb_build_object('profiles_synced', v_count));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION daily_sync_all_profile_subscriptions() IS 
'Daily job to sync subscription statuses for natural expirations. Should be scheduled via pg_cron.';

-- ============================================================
-- Step 8: Migration complete
-- ============================================================

-- Add migration log (skip if cron_logs doesn't have details column)
-- INSERT INTO cron_logs (job_name, status, details)
-- VALUES ('migration_256', 'success', jsonb_build_object(
--   'description', 'Refactored subscription sync to support multiple subscription types',
--   'new_fields', ARRAY['seller_subscription_active', 'seller_subscription_expires_at', 'affiliate_subscription_active', 'affiliate_subscription_expires_at', 'tip_subscription_active', 'tip_subscription_expires_at']
-- ));
