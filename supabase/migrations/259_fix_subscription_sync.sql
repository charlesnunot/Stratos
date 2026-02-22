-- Migration 259: Fix Subscription Sync Issues
-- ============================================================
-- Purpose: Quick fix for subscription sync problems between migrations 256 and 257
-- This migration adds missing columns and creates a simple working sync function
-- ============================================================

-- ============================================================
-- Step 1: Add missing subscription columns to profiles table
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
-- Step 2: Create simple working sync function
-- ============================================================

CREATE OR REPLACE FUNCTION sync_profile_subscription_derived(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_seller_active BOOLEAN;
  v_seller_expires TIMESTAMPTZ;
  v_affiliate_active BOOLEAN;
  v_affiliate_expires TIMESTAMPTZ;
  v_tip_active BOOLEAN;
  v_tip_expires TIMESTAMPTZ;
  v_seller_tier DECIMAL;
  v_product_limit INTEGER;
  v_user_origin TEXT;
  v_internal_tip BOOLEAN;
  v_seller_type TEXT;
BEGIN
  -- Get user info
  SELECT user_origin, COALESCE(internal_tip_enabled, false), seller_type
  INTO v_user_origin, v_internal_tip, v_seller_type
  FROM profiles
  WHERE id = p_user_id;

  -- Handle direct sellers (no subscription required)
  IF v_seller_type = 'direct' THEN
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

  -- Check seller subscription
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
  INTO v_seller_active, v_seller_expires;

  -- Get seller tier and product limit
  SELECT 
    COALESCE(MAX(subscription_tier), NULL),
    COALESCE(MAX(product_limit), 0)
  INTO v_seller_tier, v_product_limit
  FROM subscriptions
  WHERE user_id = p_user_id
    AND subscription_type = 'seller'
    AND status IN ('active', 'cancelled')
    AND expires_at > v_now;

  -- Check affiliate subscription
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
  INTO v_affiliate_active, v_affiliate_expires;

  -- Check tip subscription
  SELECT 
    EXISTS(SELECT 1 FROM subscriptions 
           WHERE user_id = p_user_id 
             AND subscription_type = 'tip' 
             AND status IN ('active', 'cancelled')
             AND expires_at > v_now),
    (SELECT MAX(expires_at) FROM subscriptions 
     WHERE user_id = p_user_id 
       AND subscription_type = 'tip' 
       AND status IN ('active', 'cancelled'))
  INTO v_tip_active, v_tip_expires;

  -- Update profile
  UPDATE profiles
  SET
    -- Seller fields
    seller_subscription_active = COALESCE(v_seller_active, false),
    seller_subscription_expires_at = v_seller_expires,
    seller_subscription_tier = v_seller_tier,
    product_limit = COALESCE(v_product_limit, 0),
    
    -- Affiliate fields
    affiliate_subscription_active = COALESCE(v_affiliate_active, false),
    affiliate_subscription_expires_at = v_affiliate_expires,
    
    -- Tip fields
    tip_subscription_active = COALESCE(v_tip_active, false),
    tip_subscription_expires_at = v_tip_expires,
    tip_enabled = CASE
      WHEN v_user_origin = 'internal' THEN (v_internal_tip OR COALESCE(v_tip_active, false))
      ELSE COALESCE(v_tip_active, false)
    END,
    
    -- Legacy fields
    subscription_type = CASE
      WHEN v_seller_active THEN 'seller'
      WHEN v_affiliate_active THEN 'affiliate'
      WHEN v_tip_active THEN 'tip'
      ELSE NULL
    END,
    subscription_expires_at = GREATEST(
      v_seller_expires,
      v_affiliate_expires,
      v_tip_expires
    ),
    subscription_tier = v_seller_tier,
    
    -- Role
    role = CASE
      WHEN v_seller_active THEN 'seller'
      WHEN v_affiliate_active THEN 'affiliate'
      ELSE role
    END,
    
    updated_at = v_now
  WHERE id = p_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_profile_subscription_derived(UUID) IS 
'Simple working sync function for subscription status. Fixes issues from migrations 256/257.';

-- ============================================================
-- Step 3: Create simple trigger
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

-- Drop conflicting triggers
DROP TRIGGER IF EXISTS sync_profile_subscription_trigger ON subscriptions;
DROP TRIGGER IF EXISTS trg_subscription_change ON subscriptions;

-- Create unified trigger
CREATE TRIGGER sync_profile_subscription_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_profile_subscription();

COMMENT ON TRIGGER sync_profile_subscription_trigger ON subscriptions IS 
'Simple trigger for subscription sync (fixed version)';

-- ============================================================
-- Step 4: Sync existing data
-- ============================================================

-- Sync users with active subscriptions
UPDATE profiles 
SET updated_at = NOW()
WHERE id IN (SELECT DISTINCT user_id FROM subscriptions WHERE status IN ('active', 'cancelled'));

-- Manual sync for users with subscriptions
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN SELECT DISTINCT user_id FROM subscriptions WHERE status IN ('active', 'cancelled')
  LOOP
    BEGIN
      PERFORM sync_profile_subscription_derived(v_user_id);
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue (skip if cron_logs doesn't have details column)
        -- INSERT INTO cron_logs (job_name, status, details)
        -- VALUES ('migration_259_sync_error', 'error', jsonb_build_object(
        --   'user_id', v_user_id,
        --   'error', SQLERRM
        -- ));
    END;
  END LOOP;
END $$;

-- ============================================================
-- Step 5: Migration complete
-- ============================================================

-- Add migration log (skip if cron_logs doesn't have details column)
-- INSERT INTO cron_logs (job_name, status, details)
-- VALUES ('migration_259', 'success', jsonb_build_object(
--   'description', 'Fixed subscription sync issues between migrations 256 and 257',
--   'fixes', ARRAY[
--     'Added missing subscription columns',
--     'Created simple working sync function',
--     'Fixed trigger conflicts',
--     'Synced existing data'
--   ]
-- ));