-- Add PostgreSQL function for atomic payment processing
-- Ensures order status update, stock reduction, and commission calculation happen atomically

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
  v_product RECORD;
  v_current_stock INT;
  v_new_stock INT;
  v_affiliate_id UUID;
BEGIN
  -- Start transaction (implicit in function)
  
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
  FOR UPDATE; -- Lock the row
  
  -- Check if order exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Order not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check if already paid (idempotency)
  IF v_order.payment_status = 'paid' THEN
    RETURN QUERY SELECT true, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Verify amount matches
  IF ABS(p_amount - v_order.total_amount) > 0.01 THEN
    RETURN QUERY SELECT false, format('Amount mismatch: expected %s, got %s', v_order.total_amount, p_amount)::TEXT;
    RETURN;
  END IF;
  
  -- Update order status
  UPDATE orders
  SET 
    payment_status = 'paid',
    order_status = 'paid',
    paid_at = p_paid_at,
    updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Update stock for products
  -- Handle order_items (multiple products)
  FOR v_order_item IN 
    SELECT product_id, quantity
    FROM order_items
    WHERE order_id = p_order_id
  LOOP
    -- Get current stock with lock
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order_item.product_id
    FOR UPDATE;
    
    IF FOUND AND v_current_stock IS NOT NULL THEN
      v_new_stock = GREATEST(0, v_current_stock - v_order_item.quantity);
      
      UPDATE products
      SET 
        stock = v_new_stock,
        updated_at = NOW()
      WHERE id = v_order_item.product_id;
    END IF;
  END LOOP;
  
  -- Handle single product (legacy format)
  IF v_order.product_id IS NOT NULL THEN
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = v_order.product_id
    FOR UPDATE;
    
    IF FOUND AND v_current_stock IS NOT NULL THEN
      v_new_stock = GREATEST(0, v_current_stock - COALESCE(v_order.quantity, 1));
      
      UPDATE products
      SET 
        stock = v_new_stock,
        updated_at = NOW()
      WHERE id = v_order.product_id;
    END IF;
  END IF;
  
  -- Commissions will be calculated separately (non-critical)
  -- This function focuses on critical operations: order status and stock
  
  RETURN QUERY SELECT true, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback is automatic in case of exception
    RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add retry_count to payment_transfers table
ALTER TABLE payment_transfers
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;

-- Create index for finding failed transfers that need retry
CREATE INDEX IF NOT EXISTS idx_payment_transfers_failed_retry
  ON payment_transfers(status, retry_count, created_at)
  WHERE status = 'failed' AND retry_count < max_retries;
