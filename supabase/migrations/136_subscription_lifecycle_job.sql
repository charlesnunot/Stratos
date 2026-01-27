-- Subscription lifecycle management
-- Implements sync_profile_subscription_derived and expire_subscriptions_and_sync_profiles
-- This migration addresses Risk 1: expired subscriptions still marked as 'active'

-- Function to sync profile subscription-derived fields from subscriptions table
-- This is the single source of truth for profile subscription state
CREATE OR REPLACE FUNCTION sync_profile_subscription_derived(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_seller_tier DECIMAL;
  v_tip_enabled BOOLEAN;
  v_primary_type TEXT;
  v_max_expires_at TIMESTAMPTZ;
  v_has_seller BOOLEAN;
  v_has_affiliate BOOLEAN;
  v_has_tip BOOLEAN;
  v_update_data JSONB;
BEGIN
  -- Get seller subscription tier (max tier from active seller subscriptions)
  SELECT COALESCE(MAX(subscription_tier), NULL)
  INTO v_seller_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW();

  -- Check if user has active tip subscription
  SELECT EXISTS(
    SELECT 1
    FROM subscriptions
    WHERE user_id = p_user_id
      AND subscription_type = 'tip'
      AND status = 'active'
      AND expires_at > NOW()
  ) INTO v_tip_enabled;

  -- Determine primary subscription type (priority: seller > affiliate > tip)
  -- and get max expires_at from all active subscriptions
  SELECT 
    CASE 
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'seller' AND status = 'active' AND expires_at > NOW()) THEN 'seller'
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'affiliate' AND status = 'active' AND expires_at > NOW()) THEN 'affiliate'
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'tip' AND status = 'active' AND expires_at > NOW()) THEN 'tip'
      ELSE NULL
    END,
    MAX(expires_at)
  INTO v_primary_type, v_max_expires_at
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > NOW();

  -- Update profile with derived subscription state
  -- Single UPDATE statement handles both cases (has active subscriptions or not)
  UPDATE profiles
  SET 
    seller_subscription_tier = v_seller_tier,
    tip_enabled = COALESCE(v_tip_enabled, false),
    subscription_type = v_primary_type,
    subscription_expires_at = v_max_expires_at,
    role = CASE 
      WHEN v_seller_tier IS NOT NULL THEN 'seller'
      ELSE role
    END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire subscriptions and sync affected user profiles
CREATE OR REPLACE FUNCTION expire_subscriptions_and_sync_profiles()
RETURNS TABLE (
  expired_count INT,
  affected_user_ids UUID[]
) AS $$
DECLARE
  v_expired_sub RECORD;
  v_affected_users UUID[] := ARRAY[]::UUID[];
  v_count INT := 0;
BEGIN
  -- Collect affected user IDs before updating (to avoid locking issues)
  SELECT ARRAY_AGG(DISTINCT user_id)
  INTO v_affected_users
  FROM subscriptions
  WHERE status = 'active'
    AND expires_at < NOW();

  -- If no expired subscriptions, return early
  IF v_affected_users IS NULL THEN
    RETURN QUERY SELECT 0, ARRAY[]::UUID[];
    RETURN;
  END IF;

  -- Update status to 'expired' for all expired subscriptions
  UPDATE subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < NOW();

  -- Get count of expired subscriptions
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Sync profile for each affected user
  FOR i IN 1..array_length(v_affected_users, 1) LOOP
    PERFORM sync_profile_subscription_derived(v_affected_users[i]);
  END LOOP;

  RETURN QUERY SELECT v_count, v_affected_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on functions
COMMENT ON FUNCTION sync_profile_subscription_derived IS 'Sync profile subscription-derived fields from subscriptions table. This is the single source of truth for subscription state in profiles.';
COMMENT ON FUNCTION expire_subscriptions_and_sync_profiles IS 'Expire subscriptions that have passed their expires_at date and sync affected user profiles. Should be called by cron job daily.';
