-- Add minimum tip amount check (spec: amount >= min_tip)
-- min_tip = 0.01 (prevents zero/negative tips)

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
  v_min_amount DECIMAL := 0.01;
  v_max_amount DECIMAL := 35.00;
  v_today_tip_count INT;
  v_max_daily_tips INT := 3;
  v_converted_amount DECIMAL;
BEGIN
  -- Check minimum tip amount
  IF p_amount IS NULL OR p_amount < v_min_amount THEN
    RETURN QUERY SELECT false, format('Tip amount must be at least %s', v_min_amount)::TEXT;
    RETURN;
  END IF;

  -- Check if tipper has tip feature enabled
  SELECT COALESCE(tip_enabled, false)
  INTO v_tip_enabled
  FROM profiles
  WHERE id = p_tipper_id;

  IF NOT v_tip_enabled THEN
    RETURN QUERY SELECT false, 'Tip feature subscription required'::TEXT;
    RETURN;
  END IF;

  v_converted_amount := CASE p_currency
    WHEN 'CNY' THEN p_amount
    WHEN 'USD' THEN p_amount * 7.0
    WHEN 'EUR' THEN p_amount * 7.5
    ELSE p_amount * 7.0
  END;

  IF v_converted_amount > v_max_amount THEN
    RETURN QUERY SELECT false, format('Single tip amount exceeds limit of %s CNY', v_max_amount)::TEXT;
    RETURN;
  END IF;

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

  RETURN QUERY SELECT true, 'OK'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_tip_limits IS 'Validates tip: min 0.01, max 35 CNY equivalent, daily limit 3 per recipient';
