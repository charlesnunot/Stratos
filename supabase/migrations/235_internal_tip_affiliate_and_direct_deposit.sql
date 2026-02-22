-- Internal users: tip/affiliate flags (admin-set, no subscription required).
-- Direct sellers: skip deposit requirement in check_seller_deposit_requirement.
-- Sync: do not let subscription overwrite internal users' tip_enabled (merge with internal_tip_enabled).

SET search_path = public;

-- 1) profiles: internal_tip_enabled, internal_affiliate_enabled (for internal users only)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS internal_tip_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_affiliate_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN profiles.internal_tip_enabled IS 'Admin-set; enables tip for internal users without tip subscription. Ignored for external users.';
COMMENT ON COLUMN profiles.internal_affiliate_enabled IS 'Admin-set; enables affiliate for internal users without affiliate subscription. Ignored for external users.';

-- 2) check_seller_deposit_requirement: direct sellers require no deposit
CREATE OR REPLACE FUNCTION check_seller_deposit_requirement(
  p_seller_id UUID,
  p_new_order_amount DECIMAL,
  p_new_order_currency TEXT DEFAULT 'USD'
)
RETURNS TABLE (
  requires_deposit BOOLEAN,
  required_amount DECIMAL,
  current_tier DECIMAL,
  suggested_tier DECIMAL,
  reason TEXT
) AS $$
DECLARE
  v_seller_type TEXT;
  v_subscription_tier DECIMAL;
  v_deposit_credit DECIMAL;
  v_unfilled_total DECIMAL;
  v_new_order_amount_usd DECIMAL;
  v_total_after_new_order DECIMAL;
  v_required_deposit DECIMAL;
  v_suggested_tier DECIMAL;
BEGIN
  -- Direct sellers: no deposit required (platform collects; no subscription/tier)
  SELECT seller_type INTO v_seller_type
  FROM profiles
  WHERE id = p_seller_id
  LIMIT 1;

  IF v_seller_type = 'direct' THEN
    RETURN QUERY SELECT
      false,
      0::DECIMAL,
      0::DECIMAL,
      0::DECIMAL,
      'Direct seller: no deposit required'::TEXT;
    RETURN;
  END IF;

  -- Get seller's current subscription tier (with lock to prevent concurrent orders)
  SELECT COALESCE(subscription_tier, 0)
  INTO v_subscription_tier
  FROM subscriptions
  WHERE user_id = p_seller_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY subscription_tier DESC
  LIMIT 1
  FOR UPDATE;

  v_deposit_credit := COALESCE(v_subscription_tier, 0);

  SELECT get_unfilled_orders_total(p_seller_id) INTO v_unfilled_total;

  v_new_order_amount_usd := convert_to_usd(p_new_order_amount, COALESCE(p_new_order_currency, 'USD'));
  v_total_after_new_order := v_unfilled_total + v_new_order_amount_usd;

  IF v_total_after_new_order > v_deposit_credit THEN
    v_required_deposit := v_total_after_new_order - v_deposit_credit;
    v_suggested_tier := CASE
      WHEN v_total_after_new_order <= 10 THEN 10
      WHEN v_total_after_new_order <= 20 THEN 20
      WHEN v_total_after_new_order <= 50 THEN 50
      WHEN v_total_after_new_order <= 100 THEN 100
      WHEN v_total_after_new_order <= 300 THEN 300
      ELSE 300
    END;

    RETURN QUERY SELECT
      true,
      v_required_deposit,
      v_deposit_credit,
      v_suggested_tier,
      format('Unfilled orders amount (%.2f USD) exceeds subscription tier credit (%.2f USD)',
        v_total_after_new_order, v_deposit_credit)::TEXT;
  ELSE
    RETURN QUERY SELECT
      false,
      0::DECIMAL,
      v_deposit_credit,
      v_deposit_credit,
      'OK'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_seller_deposit_requirement(UUID, DECIMAL, TEXT) IS
  'Returns whether seller must add deposit before next order. Direct sellers (seller_type=direct) always get requires_deposit=false.';

-- 3) sync_profile_subscription_derived: for internal users, do not overwrite tip_enabled with subscription only (merge with internal_tip_enabled)
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
  v_user_origin TEXT;
  v_internal_tip BOOLEAN;
  v_internal_affiliate BOOLEAN;
BEGIN
  -- Get internal-user flags (for merge of tip_enabled)
  SELECT user_origin, COALESCE(internal_tip_enabled, false), COALESCE(internal_affiliate_enabled, false)
  INTO v_user_origin, v_internal_tip, v_internal_affiliate
  FROM profiles
  WHERE id = p_user_id;

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

  -- Determine primary subscription type and max expires_at
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

  -- Update profile: for internal users, tip_enabled = internal_tip_enabled OR subscription-derived tip (do not overwrite admin setting)
  UPDATE profiles
  SET
    seller_subscription_tier = v_seller_tier,
    tip_enabled = CASE
      WHEN v_user_origin = 'internal' THEN (v_internal_tip OR COALESCE(v_tip_enabled, false))
      ELSE COALESCE(v_tip_enabled, false)
    END,
    subscription_type = v_primary_type,
    subscription_expires_at = v_max_expires_at,
    role = CASE
      WHEN v_seller_tier IS NOT NULL THEN 'seller'
      ELSE role
    END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_profile_subscription_derived(UUID) IS
  'Sync profile subscription-derived fields. Internal users: tip_enabled = internal_tip_enabled OR subscription tip (subscription does not overwrite admin setting).';
