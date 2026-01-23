-- Add tip subscription type support
-- This migration extends subscriptions to support tip feature subscriptions

-- Update subscriptions table to support 'tip' subscription type
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_subscription_type_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_subscription_type_check 
  CHECK (subscription_type IN ('seller', 'affiliate', 'tip'));

-- Update profiles table subscription_type constraint if it exists
DO $$
BEGIN
  -- Check if constraint exists and drop it
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_subscription_type_check'
  ) THEN
    ALTER TABLE profiles
      DROP CONSTRAINT profiles_subscription_type_check;
  END IF;
END $$;

-- Add constraint to profiles table if subscription_type column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'subscription_type'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_subscription_type_check 
      CHECK (subscription_type IN ('seller', 'affiliate', 'tip'));
  END IF;
END $$;

-- Create trigger to update tip_enabled when tip subscription becomes active
CREATE OR REPLACE FUNCTION update_tip_enabled_on_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- Update tip_enabled when tip subscription becomes active
  IF NEW.subscription_type = 'tip' AND NEW.status = 'active' AND NEW.expires_at > NOW() THEN
    UPDATE profiles
    SET tip_enabled = true
    WHERE id = NEW.user_id;
  END IF;

  -- Clear tip_enabled if tip subscription expires or is cancelled
  IF NEW.subscription_type = 'tip' AND (NEW.status IN ('expired', 'cancelled') OR NEW.expires_at <= NOW()) THEN
    -- Only clear if there's no other active tip subscription
    IF NOT EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = NEW.user_id
        AND subscription_type = 'tip'
        AND status = 'active'
        AND expires_at > NOW()
        AND id != NEW.id
    ) THEN
      UPDATE profiles
      SET tip_enabled = false
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tip subscription updates
DROP TRIGGER IF EXISTS trigger_update_tip_enabled ON subscriptions;
CREATE TRIGGER trigger_update_tip_enabled
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_tip_enabled_on_subscription();

-- Index for efficient tip subscription queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_tip_user_status 
  ON subscriptions(user_id, subscription_type, status, expires_at)
  WHERE subscription_type = 'tip';
