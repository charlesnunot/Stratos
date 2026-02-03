-- Cancelled subscriptions remain usable until expires_at (spec: 当前周期仍可使用)
-- Include status IN ('active', 'cancelled') when expires_at > NOW()

CREATE OR REPLACE FUNCTION sync_profile_subscription_derived(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_seller_tier DECIMAL;
  v_tip_enabled BOOLEAN;
  v_primary_type TEXT;
  v_max_expires_at TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(MAX(subscription_tier), NULL)
  INTO v_seller_tier
  FROM subscriptions
  WHERE user_id = p_user_id
    AND subscription_type = 'seller'
    AND status IN ('active', 'cancelled')
    AND expires_at > NOW();

  SELECT EXISTS(
    SELECT 1
    FROM subscriptions
    WHERE user_id = p_user_id
      AND subscription_type = 'tip'
      AND status IN ('active', 'cancelled')
      AND expires_at > NOW()
  ) INTO v_tip_enabled;

  SELECT 
    CASE 
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'seller' AND status IN ('active', 'cancelled') AND expires_at > NOW()) THEN 'seller'
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'affiliate' AND status IN ('active', 'cancelled') AND expires_at > NOW()) THEN 'affiliate'
      WHEN EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id AND subscription_type = 'tip' AND status IN ('active', 'cancelled') AND expires_at > NOW()) THEN 'tip'
      ELSE NULL
    END,
    MAX(expires_at)
  INTO v_primary_type, v_max_expires_at
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'cancelled')
    AND expires_at > NOW();

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

COMMENT ON FUNCTION sync_profile_subscription_derived IS 'Sync profile from subscriptions. Active and cancelled (until expiry) subscriptions grant access.';
