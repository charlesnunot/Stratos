-- Add subscription features: multi-tier seller subscriptions and tip feature subscription
-- This migration extends subscriptions to support tiered seller subscriptions (10/20/50/100/300 USD/month)
-- where subscription fee = deposit credit limit, and adds tip feature subscription support

-- Add subscription_tier and deposit_credit to subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS subscription_tier DECIMAL(10,2), -- 10, 20, 50, 100, 300 for seller subscriptions
  ADD COLUMN IF NOT EXISTS deposit_credit DECIMAL(10,2), -- Free deposit credit = subscription_tier for sellers
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'));

-- Update existing seller subscriptions to have default tier (10 USD)
UPDATE subscriptions
SET subscription_tier = 10.00,
    deposit_credit = 10.00
WHERE subscription_type = 'seller' AND subscription_tier IS NULL;

-- Add tip_enabled and seller_subscription_tier to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tip_enabled BOOLEAN DEFAULT false, -- Tip feature subscription
  ADD COLUMN IF NOT EXISTS seller_subscription_tier DECIMAL(10,2), -- Current seller subscription tier for deposit credit calculation
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'USD' CHECK (preferred_currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD'));

-- Update existing seller profiles to have default tier
UPDATE profiles
SET seller_subscription_tier = 10.00
WHERE role = 'seller' AND subscription_type = 'seller' AND seller_subscription_tier IS NULL;

-- Function to check if user has active subscription for a feature
CREATE OR REPLACE FUNCTION check_subscription_status(
  p_user_id UUID,
  p_subscription_type TEXT,
  p_required_tier DECIMAL DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_active_subscription BOOLEAN;
  v_current_tier DECIMAL;
BEGIN
  -- Check for active subscription
  SELECT EXISTS(
    SELECT 1
    FROM subscriptions
    WHERE user_id = p_user_id
      AND subscription_type = p_subscription_type
      AND status = 'active'
      AND expires_at > NOW()
      AND (p_required_tier IS NULL OR subscription_tier >= p_required_tier)
  ) INTO v_has_active_subscription;

  RETURN v_has_active_subscription;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get seller deposit credit (subscription tier)
CREATE OR REPLACE FUNCTION get_seller_deposit_credit(p_seller_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_tier DECIMAL;
BEGIN
  -- Get current subscription tier from active subscription
  SELECT COALESCE(subscription_tier, 0)
  INTO v_tier
  FROM subscriptions
  WHERE user_id = p_seller_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY subscription_tier DESC
  LIMIT 1;

  -- If no active subscription, return 0
  RETURN COALESCE(v_tier, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has tip feature enabled
CREATE OR REPLACE FUNCTION check_tip_enabled(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_tip_enabled BOOLEAN;
BEGIN
  -- Check profile tip_enabled flag
  SELECT COALESCE(tip_enabled, false)
  INTO v_tip_enabled
  FROM profiles
  WHERE id = p_user_id;

  -- Also check for active tip subscription (if we add a separate subscription type)
  -- For now, tip_enabled is a boolean flag that can be set via subscription

  RETURN v_tip_enabled;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update seller_subscription_tier in profiles when subscription changes
CREATE OR REPLACE FUNCTION update_seller_subscription_tier()
RETURNS TRIGGER AS $$
BEGIN
  -- Update seller_subscription_tier when subscription becomes active
  IF NEW.subscription_type = 'seller' AND NEW.status = 'active' AND NEW.expires_at > NOW() THEN
    UPDATE profiles
    SET seller_subscription_tier = NEW.subscription_tier
    WHERE id = NEW.user_id AND role = 'seller';
  END IF;

  -- Clear tier if subscription expires or is cancelled
  IF NEW.status IN ('expired', 'cancelled') OR NEW.expires_at <= NOW() THEN
    UPDATE profiles
    SET seller_subscription_tier = NULL
    WHERE id = NEW.user_id 
      AND role = 'seller'
      AND seller_subscription_tier = NEW.subscription_tier;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for subscription updates
DROP TRIGGER IF EXISTS trigger_update_seller_subscription_tier ON subscriptions;
CREATE TRIGGER trigger_update_seller_subscription_tier
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_subscription_tier();

-- Index for efficient subscription queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_type_status 
  ON subscriptions(user_id, subscription_type, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_subscriptions_seller_tier 
  ON subscriptions(user_id, subscription_tier) 
  WHERE subscription_type = 'seller' AND status = 'active';
