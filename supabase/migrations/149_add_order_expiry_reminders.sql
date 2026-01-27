-- Add order expiry reminder notifications
-- Sends reminders 10 minutes before order expires

CREATE OR REPLACE FUNCTION send_order_expiry_reminders()
RETURNS TABLE (
  reminders_sent INT
) AS $$
DECLARE
  v_order RECORD;
  v_count INT := 0;
BEGIN
  -- Find orders that need expiry reminders (10 minutes before expiry)
  FOR v_order IN
    SELECT id, buyer_id, seller_id, order_number, expires_at
    FROM orders
    WHERE payment_status = 'pending'
      AND order_status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at > NOW()
      AND expires_at <= NOW() + INTERVAL '10 minutes'
      AND id NOT IN (
        -- Exclude orders that already have a reminder sent
        SELECT DISTINCT related_id
        FROM notifications
        WHERE type = 'order'
          AND title = '订单即将过期提醒'
          AND related_type = 'order'
          AND created_at > NOW() - INTERVAL '15 minutes'
      )
  LOOP
    -- Calculate remaining minutes
    DECLARE
      v_minutes_remaining INT;
    BEGIN
      v_minutes_remaining := EXTRACT(EPOCH FROM (v_order.expires_at - NOW()))::INT / 60;
      
      -- Send reminder to buyer
      INSERT INTO notifications (
        user_id,
        type,
        title,
        content,
        related_id,
        related_type,
        link
      ) VALUES (
        v_order.buyer_id,
        'order',
        '订单即将过期提醒',
        '订单 ' || v_order.order_number || ' 将在 ' || v_minutes_remaining || ' 分钟后过期，请及时完成支付。',
        v_order.id,
        'order',
        '/orders/' || v_order.id || '/pay'
      );
      
      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION send_order_expiry_reminders IS 'Send reminder notifications for orders expiring in 10 minutes. Deduplicated per order per 15 minutes.';
