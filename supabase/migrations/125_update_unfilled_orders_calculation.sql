-- Revert get_unfilled_orders_total to only count paid orders
-- This aligns with the corrected deposit trigger condition:
-- Unfilled paid orders total + Current order amount (about to be paid) > Deposit credit
--
-- Only orders with payment_status = 'paid' should be counted in risk exposure
-- Pending orders (unpaid) should NOT be included, as they don't represent real risk yet

CREATE OR REPLACE FUNCTION get_unfilled_orders_total(p_seller_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_total
  FROM orders
  WHERE seller_id = p_seller_id
    AND payment_status = 'paid' -- Only count paid orders
    AND order_status IN ('pending', 'paid', 'shipped') -- Not completed or cancelled
    AND id NOT IN (
      SELECT order_id 
      FROM order_refunds 
      WHERE status = 'completed'
    );

  RETURN COALESCE(v_total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
