-- Create atomic order cancellation function
-- Ensures order cancellation and stock restoration happen atomically
-- Prevents race conditions and data inconsistencies

CREATE OR REPLACE FUNCTION cancel_order_and_restore_stock(
  p_order_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  v_order RECORD;
  v_order_item RECORD;
  v_current_stock INT;
  v_new_stock INT;
  v_order_status TEXT;
  v_payment_status TEXT;
BEGIN
  -- Lock order row to prevent concurrent cancellation
  SELECT 
    id,
    buyer_id,
    seller_id,
    order_number,
    product_id,
    quantity,
    order_status,
    payment_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE; -- Lock the row
  
  -- Check if order exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Order not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check if already cancelled (idempotency)
  IF v_order.order_status = 'cancelled' THEN
    RETURN QUERY SELECT true, NULL::TEXT; -- Already cancelled, return success
    RETURN;
  END IF;
  
  -- Check if order can be cancelled
  IF v_order.order_status IN ('completed', 'shipped') THEN
    RETURN QUERY SELECT false, 'Cannot cancel completed or shipped order'::TEXT;
    RETURN;
  END IF;
  
  -- Update order status to cancelled
  UPDATE orders
  SET 
    order_status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Restore stock for multi-product orders (order_items)
  FOR v_order_item IN 
    SELECT product_id, quantity
    FROM order_items
    WHERE order_id = p_order_id
  LOOP
    -- Lock product row to prevent concurrent stock updates
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order_item.product_id
    FOR UPDATE;
    
    IF FOUND AND v_current_stock IS NOT NULL THEN
      v_new_stock := v_current_stock + v_order_item.quantity;
      
      UPDATE products
      SET 
        stock = v_new_stock,
        updated_at = NOW()
      WHERE id = v_order_item.product_id;
    END IF;
  END LOOP;
  
  -- Handle legacy format: single product order (product_id field)
  -- Only restore if no order_items were found
  IF NOT FOUND AND v_order.product_id IS NOT NULL THEN
    -- Lock product row
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order.product_id
    FOR UPDATE;
    
    IF FOUND AND v_current_stock IS NOT NULL THEN
      v_new_stock := v_current_stock + COALESCE(v_order.quantity, 1);
      
      UPDATE products
      SET 
        stock = v_new_stock,
        updated_at = NOW()
      WHERE id = v_order.product_id;
    END IF;
  END IF;
  
  RETURN QUERY SELECT true, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Automatic rollback on exception
    RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cancel_order_and_restore_stock(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION cancel_order_and_restore_stock(UUID) IS 
  'Atomically cancels an order and restores product stock. Prevents race conditions by using row-level locks. Returns success status and error message if any.';
