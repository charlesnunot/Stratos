-- Add shipping reminder notifications
-- Sends reminders to sellers 3 days before shipping deadline

CREATE OR REPLACE FUNCTION send_shipping_reminders()
RETURNS VOID AS $$
DECLARE
  v_order RECORD;
  v_days_remaining INT;
BEGIN
  -- Find orders that need shipping reminders (3 days before deadline)
  FOR v_order IN
    SELECT id, seller_id, buyer_id, order_number, ship_by_date
    FROM orders
    WHERE payment_status = 'paid'
      AND order_status = 'paid'
      AND ship_by_date IS NOT NULL
      AND ship_by_date > NOW()
      AND ship_by_date <= NOW() + INTERVAL '3 days'
      AND id NOT IN (
        -- Exclude orders that already have a reminder sent today
        SELECT DISTINCT related_id
        FROM notifications
        WHERE type = 'order'
          AND title = '发货提醒'
          AND related_type = 'order'
          AND created_at::date = CURRENT_DATE
      )
  LOOP
    v_days_remaining := EXTRACT(DAY FROM (v_order.ship_by_date - NOW()))::INT;
    
    -- Send reminder to seller
    INSERT INTO notifications (
      user_id,
      type,
      title,
      content,
      related_id,
      related_type,
      link
    ) VALUES (
      v_order.seller_id,
      'order',
      '发货提醒',
      '订单 ' || v_order.order_number || ' 需要在 ' || v_days_remaining || ' 天内发货，请及时处理。',
      v_order.id,
      'order',
      '/seller/orders'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for efficient reminder queries
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE), so we index all paid orders
-- The time-based filtering (ship_by_date > NOW()) will be done in the query
CREATE INDEX IF NOT EXISTS idx_orders_ship_reminder 
  ON orders(ship_by_date) 
  WHERE payment_status = 'paid' 
    AND order_status = 'paid' 
    AND ship_by_date IS NOT NULL;
