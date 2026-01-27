-- Create function to check deposit requirement and execute side-effects atomically
-- This ensures deposit check + side-effects happen in a single transaction
-- Uses FOR UPDATE lock to prevent concurrent deposit checks for the same seller

CREATE OR REPLACE FUNCTION check_deposit_and_execute_side_effects(
  p_seller_id UUID,
  p_order_id UUID,
  p_order_amount DECIMAL,
  p_payment_provider TEXT,
  p_payment_session_id TEXT
)
RETURNS TABLE (
  requires_deposit BOOLEAN,
  required_amount DECIMAL,
  current_tier DECIMAL,
  suggested_tier DECIMAL,
  reason TEXT,
  deposit_lot_id UUID
) AS $$
DECLARE
  v_deposit_check RECORD;
  v_subscription RECORD;
  v_existing_lot RECORD;
  v_new_lot_id UUID;
  v_notification_exists BOOLEAN;
  v_order_currency TEXT;
BEGIN
  -- Lock seller's subscription to prevent concurrent access
  SELECT subscription_tier, currency
  INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_seller_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY subscription_tier DESC
  LIMIT 1
  FOR UPDATE; -- Lock to prevent concurrent access

  -- Get order currency for proper conversion
  SELECT COALESCE(currency, 'USD') INTO v_order_currency
  FROM orders
  WHERE id = p_order_id
  LIMIT 1;

  -- Check deposit requirement (uses locked subscription)
  -- The function returns a table, so we need to get the first row
  -- Pass order currency to ensure proper conversion
  SELECT 
    requires_deposit,
    required_amount,
    current_tier,
    suggested_tier,
    reason
  INTO v_deposit_check
  FROM check_seller_deposit_requirement(p_seller_id, p_order_amount, v_order_currency)
  LIMIT 1;

  -- If deposit is required, execute side-effects in the same transaction
  IF v_deposit_check.requires_deposit THEN
    -- Disable seller payment
    PERFORM disable_seller_payment(p_seller_id, 'deposit_required');

    -- Check if deposit lot already exists
    SELECT * INTO v_existing_lot
    FROM seller_deposit_lots
    WHERE seller_id = p_seller_id
      AND status = 'required'
    ORDER BY required_at DESC
    LIMIT 1
    FOR UPDATE; -- Lock to prevent concurrent updates

    IF v_existing_lot IS NOT NULL THEN
      -- Update existing lot
      UPDATE seller_deposit_lots
      SET
        required_amount = v_deposit_check.required_amount,
        subscription_tier_snapshot = v_deposit_check.current_tier,
        order_id = p_order_id,
        payment_provider = p_payment_provider,
        payment_session_id = p_payment_session_id,
        trigger_reason = 'pre_payment_risk',
        updated_at = NOW()
      WHERE id = v_existing_lot.id
      RETURNING id INTO v_new_lot_id;
    ELSE
      -- Create new deposit lot
      INSERT INTO seller_deposit_lots (
        seller_id,
        required_amount,
        currency,
        status,
        subscription_tier_snapshot,
        required_at,
        order_id,
        payment_provider,
        payment_session_id,
        trigger_reason
      )
      VALUES (
        p_seller_id,
        v_deposit_check.required_amount,
        COALESCE(v_subscription.currency, 'USD'),
        'required',
        v_deposit_check.current_tier,
        NOW(),
        p_order_id,
        p_payment_provider,
        p_payment_session_id,
        'pre_payment_risk'
      )
      RETURNING id INTO v_new_lot_id;
    END IF;

    -- Check if notification was sent recently (within 5 minutes)
    SELECT EXISTS(
      SELECT 1
      FROM notifications
      WHERE user_id = p_seller_id
        AND type = 'system'
        AND title = '需要支付保证金'
        AND related_type IS NULL
        AND created_at > NOW() - INTERVAL '5 minutes'
      LIMIT 1
    ) INTO v_notification_exists;

    -- Create notification if none exists
    IF NOT v_notification_exists THEN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        content,
        related_id,
        related_type,
        link
      )
      VALUES (
        p_seller_id,
        'system',
        '需要支付保证金',
        '您的保证金不足，无法接受新订单。请支付保证金以继续接受订单。',
        NULL,
        NULL,
        '/seller/deposit/pay'
      );
    END IF;
  END IF;

  -- Return deposit check result
  RETURN QUERY SELECT
    v_deposit_check.requires_deposit,
    v_deposit_check.required_amount,
    v_deposit_check.current_tier,
    v_deposit_check.suggested_tier,
    v_deposit_check.reason,
    v_new_lot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
