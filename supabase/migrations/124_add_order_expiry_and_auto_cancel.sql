-- Add order expiry and auto-cancel functionality
-- Adds expires_at field to orders table and creates function to auto-cancel expired orders

-- Add expires_at field to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Create index for efficient querying of expired orders
CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at)
  WHERE payment_status = 'pending' AND order_status = 'pending';

-- Function to auto-cancel expired orders
CREATE OR REPLACE FUNCTION auto_cancel_expired_orders()
RETURNS TABLE (
  cancelled_count INT,
  cancelled_order_ids UUID[]
) AS $$
DECLARE
  v_order RECORD;
  v_order_item RECORD;
  v_product RECORD;
  v_current_stock INT;
  v_new_stock INT;
  v_cancelled_ids UUID[] := ARRAY[]::UUID[];
  v_count INT := 0;
BEGIN
  -- Find expired unpaid orders
  FOR v_order IN
    SELECT id, buyer_id, seller_id, order_number, product_id, quantity
    FROM orders
    WHERE payment_status = 'pending'
      AND order_status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      FOR UPDATE -- Lock rows to prevent concurrent processing
  LOOP
    BEGIN
      -- Update order status to cancelled
      UPDATE orders
      SET 
        order_status = 'cancelled',
        updated_at = NOW()
      WHERE id = v_order.id;

      -- Restore stock for order_items (multi-product orders)
      FOR v_order_item IN
        SELECT product_id, quantity
        FROM order_items
        WHERE order_id = v_order.id
      LOOP
        -- Get current stock
        SELECT stock INTO v_current_stock
        FROM products
        WHERE id = v_order_item.product_id
        FOR UPDATE;

        IF v_current_stock IS NOT NULL THEN
          v_new_stock := v_current_stock + v_order_item.quantity;
          UPDATE products
          SET 
            stock = v_new_stock,
            updated_at = NOW()
          WHERE id = v_order_item.product_id;
        END IF;
      END LOOP;

      -- If no order_items found, restore stock from product_id (legacy format)
      IF NOT FOUND THEN
        IF v_order.product_id IS NOT NULL THEN
          SELECT stock INTO v_current_stock
          FROM products
          WHERE id = v_order.product_id
          FOR UPDATE;

          IF v_current_stock IS NOT NULL THEN
            v_new_stock := v_current_stock + COALESCE(v_order.quantity, 1);
            UPDATE products
            SET 
              stock = v_new_stock,
              updated_at = NOW()
            WHERE id = v_order.product_id;
          END IF;
        END IF;
      END IF;

      -- Create notification for buyer
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
        '订单已自动取消',
        '订单 ' || v_order.order_number || ' 因超时未支付已自动取消',
        v_order.id,
        'order',
        '/orders/' || v_order.id
      );

      -- Create notification for seller (if different from buyer)
      IF v_order.seller_id IS NOT NULL AND v_order.seller_id != v_order.buyer_id THEN
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
          '订单已自动取消',
          '订单 ' || v_order.order_number || ' 因超时未支付已自动取消',
          v_order.id,
          'order',
          '/orders/' || v_order.id
        );
      END IF;

      -- Add to cancelled list
      v_cancelled_ids := array_append(v_cancelled_ids, v_order.id);
      v_count := v_count + 1;

    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue with other orders
        RAISE WARNING 'Error cancelling order %: %', v_order.id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_count, v_cancelled_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
