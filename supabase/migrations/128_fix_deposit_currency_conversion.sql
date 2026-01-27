-- Fix deposit calculation to handle currency conversion
-- All amounts should be converted to USD before comparison
-- This ensures fair comparison between orders in different currencies and subscription tiers in USD

-- Helper function to convert amount to USD
-- Uses exchange_rates table if available, otherwise uses fixed fallback rates
CREATE OR REPLACE FUNCTION convert_to_usd(
  p_amount DECIMAL,
  p_from_currency TEXT
)
RETURNS DECIMAL AS $$
DECLARE
  v_rate DECIMAL;
  v_amount_usd DECIMAL;
BEGIN
  -- If amount is 0 or currency is USD, return as is
  IF p_amount = 0 OR p_from_currency = 'USD' THEN
    RETURN p_amount;
  END IF;

  -- Try to get rate from exchange_rates table (most recent valid rate)
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE base_currency = p_from_currency
    AND target_currency = 'USD'
    AND (valid_until IS NULL OR valid_until > NOW())
    AND valid_from <= NOW()
  ORDER BY valid_from DESC
  LIMIT 1;

  -- If no rate found, use fixed fallback rates
  IF v_rate IS NULL THEN
    v_rate := CASE p_from_currency
      WHEN 'CNY' THEN 1.0 / 7.2  -- 1 CNY = 0.139 USD
      WHEN 'EUR' THEN 1.0 / 0.92  -- 1 EUR = 1.087 USD
      WHEN 'GBP' THEN 1.0 / 0.79  -- 1 GBP = 1.266 USD
      WHEN 'JPY' THEN 1.0 / 150.0  -- 1 JPY = 0.0067 USD
      WHEN 'KRW' THEN 1.0 / 1300.0  -- 1 KRW = 0.00077 USD
      WHEN 'SGD' THEN 1.0 / 1.34  -- 1 SGD = 0.746 USD
      WHEN 'HKD' THEN 1.0 / 7.82  -- 1 HKD = 0.128 USD
      WHEN 'AUD' THEN 1.0 / 1.53  -- 1 AUD = 0.654 USD
      WHEN 'CAD' THEN 1.0 / 1.36  -- 1 CAD = 0.735 USD
      ELSE 1.0  -- Default: assume same as USD if unknown currency
    END;
  END IF;

  -- Convert to USD
  v_amount_usd := p_amount * v_rate;

  -- Round to 2 decimal places
  RETURN ROUND(v_amount_usd, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update get_unfilled_orders_total to convert all amounts to USD
CREATE OR REPLACE FUNCTION get_unfilled_orders_total(p_seller_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL := 0;
  v_order RECORD;
BEGIN
  -- Loop through all unfilled paid orders and convert each to USD
  FOR v_order IN
    SELECT total_amount, COALESCE(currency, 'USD') as order_currency
    FROM orders
    WHERE seller_id = p_seller_id
      AND payment_status = 'paid' -- Only count paid orders
      AND order_status IN ('pending', 'paid', 'shipped') -- Not completed or cancelled
      AND id NOT IN (
        SELECT order_id 
        FROM order_refunds 
        WHERE status = 'completed'
      )
  LOOP
    -- Convert each order amount to USD and add to total
    v_total := v_total + convert_to_usd(v_order.total_amount, v_order.order_currency);
  END LOOP;

  RETURN COALESCE(v_total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update check_seller_deposit_requirement to convert new order amount to USD
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
  v_subscription_tier DECIMAL;
  v_deposit_credit DECIMAL;
  v_unfilled_total DECIMAL;
  v_new_order_amount_usd DECIMAL;
  v_total_after_new_order DECIMAL;
  v_required_deposit DECIMAL;
  v_suggested_tier DECIMAL;
BEGIN
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
  FOR UPDATE; -- Lock to prevent concurrent access

  -- If no active subscription, tier is 0
  v_deposit_credit := COALESCE(v_subscription_tier, 0); -- Subscription tier is always in USD

  -- Get unfilled orders total (already in USD after conversion)
  SELECT get_unfilled_orders_total(p_seller_id)
  INTO v_unfilled_total;

  -- Convert new order amount to USD
  v_new_order_amount_usd := convert_to_usd(p_new_order_amount, COALESCE(p_new_order_currency, 'USD'));

  -- Calculate total after new order (both in USD now)
  v_total_after_new_order := v_unfilled_total + v_new_order_amount_usd;

  -- Check if deposit is required
  IF v_total_after_new_order > v_deposit_credit THEN
    v_required_deposit := v_total_after_new_order - v_deposit_credit;

    -- Suggest appropriate tier
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
