-- Create order_groups table (parent orders) and extend orders table (child orders)
-- Supports multi-seller orders with independent payment per seller

-- ============================================
-- 1. Create order_groups table (parent orders)
-- ============================================

CREATE TABLE IF NOT EXISTS order_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_group_number TEXT UNIQUE NOT NULL,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'failed')),
  order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'paid', 'completed', 'cancelled')),
  shipping_address JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_groups_buyer_id ON order_groups(buyer_id);
CREATE INDEX IF NOT EXISTS idx_order_groups_payment_status ON order_groups(payment_status);
CREATE INDEX IF NOT EXISTS idx_order_groups_order_status ON order_groups(order_status);

-- Add comments
COMMENT ON TABLE order_groups IS 'Parent orders that group multiple child orders (one per seller)';
COMMENT ON COLUMN order_groups.payment_status IS 'Payment status: pending (all unpaid), partial (some paid), paid (all paid), failed (all failed)';

-- ============================================
-- 2. Extend orders table (child orders)
-- ============================================

-- Add parent_order_id to link child orders to parent order group
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES order_groups(id) ON DELETE CASCADE;

-- Add seller_payment_status to track individual seller payment status
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_payment_status TEXT DEFAULT 'pending' CHECK (seller_payment_status IN ('pending', 'paid', 'failed'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_seller_payment_status ON orders(seller_payment_status) WHERE seller_payment_status IS NOT NULL;

-- Add comments
COMMENT ON COLUMN orders.parent_order_id IS 'Reference to parent order group (if this is a child order)';
COMMENT ON COLUMN orders.seller_payment_status IS 'Individual seller payment status for this child order';

-- ============================================
-- 3. Create order_seller_payments table (detailed payment tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS order_seller_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('stripe', 'paypal', 'alipay', 'wechat', 'bank')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  payment_session_id TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, seller_id) -- One payment record per order-seller pair
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_seller_payments_order_id ON order_seller_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_seller_payments_seller_id ON order_seller_payments(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_seller_payments_payment_status ON order_seller_payments(payment_status);

-- Add comments
COMMENT ON TABLE order_seller_payments IS 'Detailed payment tracking for each seller in an order';
COMMENT ON COLUMN order_seller_payments.payment_session_id IS 'Payment provider session ID (e.g., Stripe checkout session ID)';

-- ============================================
-- 4. Create function to update parent order payment status
-- ============================================

CREATE OR REPLACE FUNCTION update_order_group_payment_status(
  p_order_group_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_total_orders INT;
  v_paid_orders INT;
  v_failed_orders INT;
  v_new_status TEXT;
BEGIN
  -- Count total, paid, and failed child orders
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE seller_payment_status = 'paid'),
    COUNT(*) FILTER (WHERE seller_payment_status = 'failed')
  INTO v_total_orders, v_paid_orders, v_failed_orders
  FROM orders
  WHERE parent_order_id = p_order_group_id;

  -- Determine new payment status
  IF v_paid_orders = v_total_orders AND v_total_orders > 0 THEN
    v_new_status := 'paid';
  ELSIF v_failed_orders = v_total_orders AND v_total_orders > 0 THEN
    v_new_status := 'failed';
  ELSIF v_paid_orders > 0 AND v_paid_orders < v_total_orders THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  -- Update parent order
  UPDATE order_groups
  SET payment_status = v_new_status,
      updated_at = NOW()
  WHERE id = p_order_group_id;

  -- If all paid, also update order_status
  IF v_new_status = 'paid' THEN
    UPDATE order_groups
    SET order_status = 'paid',
        updated_at = NOW()
    WHERE id = p_order_group_id;
  END IF;

  RETURN v_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_order_group_payment_status IS 'Update parent order payment status based on child orders payment status';

-- ============================================
-- 5. Create trigger to auto-update parent order status
-- ============================================

CREATE OR REPLACE FUNCTION trigger_update_order_group_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If seller_payment_status changed and order has parent
  IF NEW.parent_order_id IS NOT NULL AND 
     (OLD.seller_payment_status IS DISTINCT FROM NEW.seller_payment_status) THEN
    PERFORM update_order_group_payment_status(NEW.parent_order_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_order_group_status_trigger ON orders;
CREATE TRIGGER update_order_group_status_trigger
  AFTER UPDATE OF seller_payment_status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_order_group_status();

-- ============================================
-- 6. Add RLS policies for order_groups
-- ============================================

ALTER TABLE order_groups ENABLE ROW LEVEL SECURITY;

-- Policy: Buyers can view their own order groups
CREATE POLICY "Buyers can view their own order groups"
  ON order_groups
  FOR SELECT
  USING (auth.uid() = buyer_id);

-- Policy: System can insert order groups (via service role)
-- Note: Actual inserts should be done via API routes using service_role_key

-- ============================================
-- 7. Add RLS policies for order_seller_payments
-- ============================================

ALTER TABLE order_seller_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Buyers can view payment records for their orders
CREATE POLICY "Buyers can view payment records for their orders"
  ON order_seller_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_seller_payments.order_id
      AND orders.buyer_id = auth.uid()
    )
  );

-- Policy: Sellers can view payment records for their orders
CREATE POLICY "Sellers can view payment records for their orders"
  ON order_seller_payments
  FOR SELECT
  USING (auth.uid() = seller_id);

-- Policy: System can insert/update payment records (via service role)
-- Note: Actual inserts/updates should be done via API routes using service_role_key

-- ============================================
-- 8. Create function to get available payment methods for sellers
-- ============================================

CREATE OR REPLACE FUNCTION get_available_payment_methods_for_sellers(
  p_seller_ids UUID[]
)
RETURNS TABLE (
  seller_id UUID,
  payment_provider TEXT,
  seller_payout_eligibility TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.payment_provider,
    p.seller_payout_eligibility
  FROM profiles p
  WHERE p.id = ANY(p_seller_ids)
    AND p.seller_payout_eligibility = 'eligible'
    AND p.payment_provider IS NOT NULL
    AND p.payment_account_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_available_payment_methods_for_sellers IS 'Get available payment methods for a list of sellers (only eligible sellers with bound accounts)';
