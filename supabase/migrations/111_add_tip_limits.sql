-- Add tip limits: max 35 CNY per tip, max 3 tips per day per user to same recipient
-- Requires tip feature subscription

-- Create tip_transactions table if it doesn't exist (or extend existing tips table)
CREATE TABLE IF NOT EXISTS tip_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  tipper_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'CNY' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  payment_method TEXT CHECK (payment_method IN ('stripe', 'paypal', 'alipay', 'wechat', 'bank')),
  payment_transaction_id UUID REFERENCES payment_transactions(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to check tip limits before creating tip
CREATE OR REPLACE FUNCTION check_tip_limits(
  p_tipper_id UUID,
  p_recipient_id UUID,
  p_amount DECIMAL,
  p_currency TEXT DEFAULT 'CNY'
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_tip_enabled BOOLEAN;
  v_max_amount DECIMAL := 35.00; -- Max 35 CNY (or equivalent)
  v_today_tip_count INT;
  v_max_daily_tips INT := 3;
  v_converted_amount DECIMAL;
BEGIN
  -- Check if tipper has tip feature enabled
  SELECT COALESCE(tip_enabled, false)
  INTO v_tip_enabled
  FROM profiles
  WHERE id = p_tipper_id;

  IF NOT v_tip_enabled THEN
    RETURN QUERY SELECT false, 'Tip feature subscription required'::TEXT;
    RETURN;
  END IF;

  -- Convert amount to CNY for comparison (simplified - in production, use exchange rates)
  -- For now, assume 1 USD = 7 CNY, 1 EUR = 7.5 CNY, etc.
  v_converted_amount := CASE p_currency
    WHEN 'CNY' THEN p_amount
    WHEN 'USD' THEN p_amount * 7.0
    WHEN 'EUR' THEN p_amount * 7.5
    ELSE p_amount * 7.0 -- Default conversion
  END;

  -- Check single tip amount limit (35 CNY)
  IF v_converted_amount > v_max_amount THEN
    RETURN QUERY SELECT false, format('Single tip amount exceeds limit of %s CNY', v_max_amount)::TEXT;
    RETURN;
  END IF;

  -- Check daily tip count limit (3 tips per day to same recipient)
  SELECT COUNT(*)
  INTO v_today_tip_count
  FROM tip_transactions
  WHERE tipper_id = p_tipper_id
    AND recipient_id = p_recipient_id
    AND status = 'paid'
    AND created_at >= CURRENT_DATE;

  IF v_today_tip_count >= v_max_daily_tips THEN
    RETURN QUERY SELECT false, format('Daily tip limit of %s tips to this recipient reached', v_max_daily_tips)::TEXT;
    RETURN;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset daily tip counts (called by cron job)
CREATE OR REPLACE FUNCTION reset_daily_tip_counts()
RETURNS VOID AS $$
BEGIN
  -- This function is called daily to reset counters
  -- The actual limit check is done in check_tip_limits function using CURRENT_DATE
  -- No action needed here, but function exists for potential future use
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Indexes for efficient tip queries
CREATE INDEX IF NOT EXISTS idx_tip_transactions_tipper_recipient_date 
  ON tip_transactions(tipper_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tip_transactions_post_id 
  ON tip_transactions(post_id);

CREATE INDEX IF NOT EXISTS idx_tip_transactions_status 
  ON tip_transactions(status);

-- Update posts table to track tip amount (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'tip_amount'
  ) THEN
    ALTER TABLE posts ADD COLUMN tip_amount DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Function to update post tip amount when tip is paid
CREATE OR REPLACE FUNCTION update_post_tip_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    UPDATE posts
    SET tip_amount = COALESCE(tip_amount, 0) + NEW.amount
    WHERE id = NEW.post_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update post tip amount
DROP TRIGGER IF EXISTS trigger_update_post_tip_amount ON tip_transactions;
CREATE TRIGGER trigger_update_post_tip_amount
  AFTER INSERT OR UPDATE ON tip_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_post_tip_amount();
