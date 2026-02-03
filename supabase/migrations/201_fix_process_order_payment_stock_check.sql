-- Fix process_order_payment_transaction: fail if stock insufficient
-- Spec: 任一库存不足 → 事务失败 → 标记 payment 为 failed_manual_review

CREATE OR REPLACE FUNCTION process_order_payment_transaction(
  p_order_id UUID,
  p_amount DECIMAL,
  p_paid_at TIMESTAMPTZ DEFAULT NOW()
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
  v_qty_needed INT;
BEGIN
  -- Get order details with lock
  SELECT 
    id,
    buyer_id,
    seller_id,
    affiliate_id,
    product_id,
    quantity,
    total_amount,
    payment_status,
    order_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Order not found'::TEXT;
    RETURN;
  END IF;
  
  IF v_order.payment_status = 'paid' THEN
    RETURN QUERY SELECT true, NULL::TEXT;
    RETURN;
  END IF;
  
  IF ABS(p_amount - v_order.total_amount) > 0.01 THEN
    RETURN QUERY SELECT false, format('Amount mismatch: expected %s, got %s', v_order.total_amount, p_amount)::TEXT;
    RETURN;
  END IF;
  
  -- Step 1: Verify stock BEFORE any updates (fail fast)
  FOR v_order_item IN 
    SELECT product_id, quantity
    FROM order_items
    WHERE order_id = p_order_id
  LOOP
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order_item.product_id
    FOR UPDATE;
    
    IF NOT FOUND OR v_current_stock IS NULL THEN
      RETURN QUERY SELECT false, format('Product %s not found or has no stock', v_order_item.product_id)::TEXT;
      RETURN;
    END IF;
    IF v_current_stock < v_order_item.quantity THEN
      RETURN QUERY SELECT false, format('Insufficient stock for product %s: available %s, required %s',
        v_order_item.product_id, v_current_stock, v_order_item.quantity)::TEXT;
      RETURN;
    END IF;
  END LOOP;
  
  -- Legacy single product
  IF v_order.product_id IS NOT NULL THEN
    v_qty_needed := COALESCE(v_order.quantity, 1);
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order.product_id
    FOR UPDATE;
    
    IF FOUND AND v_current_stock IS NOT NULL THEN
      IF v_current_stock < v_qty_needed THEN
        RETURN QUERY SELECT false, format('Insufficient stock for product %s: available %s, required %s',
          v_order.product_id, v_current_stock, v_qty_needed)::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;
  
  -- Step 2: Update order status
  UPDATE orders
  SET 
    payment_status = 'paid',
    order_status = 'paid',
    paid_at = p_paid_at,
    updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Step 3: Deduct stock
  FOR v_order_item IN 
    SELECT product_id, quantity
    FROM order_items
    WHERE order_id = p_order_id
  LOOP
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order_item.product_id
    FOR UPDATE;
    
    IF FOUND AND v_current_stock IS NOT NULL THEN
      v_new_stock := v_current_stock - v_order_item.quantity;
      UPDATE products
      SET stock = v_new_stock, updated_at = NOW()
      WHERE id = v_order_item.product_id;
    END IF;
  END LOOP;
  
  IF v_order.product_id IS NOT NULL THEN
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order.product_id
    FOR UPDATE;
    
    IF FOUND AND v_current_stock IS NOT NULL THEN
      v_new_stock := v_current_stock - COALESCE(v_order.quantity, 1);
      UPDATE products
      SET stock = v_new_stock, updated_at = NOW()
      WHERE id = v_order.product_id;
    END IF;
  END IF;
  
  RETURN QUERY SELECT true, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_order_payment_transaction IS 'Atomic order payment: verify stock first, then update order and deduct stock. Fails if insufficient stock.';
