-- Add notifications to auto_create_shipping_dispute function
-- This migration updates the function to send notifications to both buyer and seller when shipping timeout dispute is created

CREATE OR REPLACE FUNCTION auto_create_shipping_dispute()
RETURNS VOID AS $$
DECLARE
  v_order RECORD;
  v_dispute_id UUID;
BEGIN
  -- Find orders that should have been shipped but weren't
  FOR v_order IN
    SELECT id, buyer_id, seller_id, order_number
    FROM orders
    WHERE payment_status = 'paid'
      AND order_status NOT IN ('shipped', 'completed', 'cancelled')
      AND ship_by_date IS NOT NULL
      AND ship_by_date < NOW()
      AND id NOT IN (
        SELECT order_id 
        FROM order_disputes 
        WHERE dispute_type = 'seller_not_shipping'
          AND status IN ('pending', 'reviewing')
      )
  LOOP
    -- Auto-create dispute
    INSERT INTO order_disputes (
      order_id,
      dispute_type,
      status,
      initiated_by,
      initiated_by_type,
      reason
    ) VALUES (
      v_order.id,
      'seller_not_shipping',
      'pending',
      v_order.buyer_id,
      'system',
      'Order not shipped within 7 days after payment'
    ) RETURNING id INTO v_dispute_id;

    -- Send notification to buyer
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
      '订单超时未发货',
      '您的订单 ' || v_order.order_number || ' 已超过7天未发货，系统已自动创建争议。您可以申请退款。',
      v_order.id,
      'order',
      '/orders/' || v_order.id || '/dispute'
    );

    -- Send notification to seller
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
      '订单超时未发货',
      '订单 ' || v_order.order_number || ' 已超过7天未发货，系统已自动创建争议。请尽快处理。',
      v_order.id,
      'order',
      '/seller/orders/' || v_order.id
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
