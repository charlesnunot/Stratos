-- Create seller deposit lots table for dynamic deposit system
-- Subscription fee acts as free deposit credit, additional deposits required when unfilled orders exceed credit

CREATE TABLE IF NOT EXISTS seller_deposit_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  required_amount DECIMAL(10,2) NOT NULL, -- Amount required = unfilled orders total - subscription tier
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  status TEXT DEFAULT 'required' CHECK (status IN ('required', 'held', 'refundable', 'refunding', 'refunded', 'forfeited')),
  subscription_tier_snapshot DECIMAL(10,2), -- Subscription tier at time of requirement
  required_at TIMESTAMPTZ NOT NULL, -- When deposit was required
  held_at TIMESTAMPTZ, -- When deposit was paid/received
  refundable_at TIMESTAMPTZ, -- When deposit becomes refundable (3 business days after conditions met)
  refund_method TEXT CHECK (refund_method IN ('paypal', 'alipay', 'wechat', 'bank', 'stripe')),
  refund_fee_amount DECIMAL(10,2), -- Actual transaction fee from payment channel
  refunded_amount DECIMAL(10,2), -- Actual amount refunded (required_amount - refund_fee_amount)
  refund_transaction_id UUID REFERENCES payment_transactions(id),
  metadata JSONB DEFAULT '{}'::jsonb, -- Store unfilled orders snapshot, subscription tier, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add payment_enabled flag to products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS payment_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_disabled_reason TEXT; -- 'deposit_required', 'upgrade_subscription', etc.

-- Function to calculate unfilled orders total for a seller
CREATE OR REPLACE FUNCTION get_unfilled_orders_total(p_seller_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_total
  FROM orders
  WHERE seller_id = p_seller_id
    AND payment_status = 'paid'
    AND order_status IN ('pending', 'paid', 'shipped') -- Not completed or cancelled
    AND id NOT IN (
      SELECT order_id 
      FROM order_refunds 
      WHERE status = 'completed'
    );

  RETURN COALESCE(v_total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if seller needs deposit (with database lock for concurrency)
CREATE OR REPLACE FUNCTION check_seller_deposit_requirement(
  p_seller_id UUID,
  p_new_order_amount DECIMAL
)
RETURNS TABLE (
  requires_deposit BOOLEAN,
  required_amount DECIMAL,
  current_tier DECIMAL,
  suggested_tier DECIMAL,
  reason TEXT
) AS $$
DECLARE
  v_subscription_tier DECIMAL;
  v_deposit_credit DECIMAL;
  v_unfilled_total DECIMAL;
  v_total_after_new_order DECIMAL;
  v_required_deposit DECIMAL;
  v_suggested_tier DECIMAL;
BEGIN
  -- Get seller's current subscription tier (with lock to prevent concurrent orders)
  SELECT COALESCE(subscription_tier, 0)
  INTO v_subscription_tier
  FROM subscriptions
  WHERE user_id = p_seller_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY subscription_tier DESC
  LIMIT 1
  FOR UPDATE; -- Lock to prevent concurrent access

  -- If no active subscription, tier is 0
  v_deposit_credit := COALESCE(v_subscription_tier, 0);

  -- Get unfilled orders total (already locked by FOR UPDATE above)
  SELECT get_unfilled_orders_total(p_seller_id)
  INTO v_unfilled_total;

  -- Calculate total after new order
  v_total_after_new_order := v_unfilled_total + p_new_order_amount;

  -- Check if deposit is required
  IF v_total_after_new_order > v_deposit_credit THEN
    v_required_deposit := v_total_after_new_order - v_deposit_credit;

    -- Suggest appropriate tier
    v_suggested_tier := CASE
      WHEN v_total_after_new_order <= 10 THEN 10
      WHEN v_total_after_new_order <= 20 THEN 20
      WHEN v_total_after_new_order <= 50 THEN 50
      WHEN v_total_after_new_order <= 100 THEN 100
      WHEN v_total_after_new_order <= 300 THEN 300
      ELSE 300
    END;

    RETURN QUERY SELECT
      true,
      v_required_deposit,
      v_deposit_credit,
      v_suggested_tier,
      format('Unfilled orders amount (%s) exceeds subscription tier credit (%s)', 
        v_total_after_new_order, v_deposit_credit)::TEXT;
  ELSE
    RETURN QUERY SELECT
      false,
      0::DECIMAL,
      v_deposit_credit,
      v_deposit_credit,
      'OK'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to disable seller payment (close payment for all products)
CREATE OR REPLACE FUNCTION disable_seller_payment(
  p_seller_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET 
    payment_enabled = false,
    payment_disabled_reason = p_reason
  WHERE seller_id = p_seller_id
    AND payment_enabled = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to enable seller payment (restore payment for all products)
CREATE OR REPLACE FUNCTION enable_seller_payment(p_seller_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET 
    payment_enabled = true,
    payment_disabled_reason = NULL
  WHERE seller_id = p_seller_id
    AND payment_enabled = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if deposit can be refunded
CREATE OR REPLACE FUNCTION check_deposit_refundable(p_deposit_lot_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_lot RECORD;
  v_unfilled_total DECIMAL;
  v_current_tier DECIMAL;
BEGIN
  SELECT *
  INTO v_lot
  FROM seller_deposit_lots
  WHERE id = p_deposit_lot_id;

  IF v_lot.status != 'held' THEN
    RETURN false;
  END IF;

  -- Get current subscription tier
  SELECT COALESCE(subscription_tier, 0)
  INTO v_current_tier
  FROM subscriptions
  WHERE user_id = v_lot.seller_id
    AND subscription_type = 'seller'
    AND status = 'active'
    AND expires_at > NOW()
  ORDER BY subscription_tier DESC
  LIMIT 1;

  -- Get current unfilled orders total
  SELECT get_unfilled_orders_total(v_lot.seller_id)
  INTO v_unfilled_total;

  -- Check if unfilled orders <= current tier AND no active disputes
  IF v_unfilled_total <= v_current_tier AND NOT EXISTS (
    SELECT 1
    FROM order_disputes
    WHERE order_id IN (
      SELECT id FROM orders WHERE seller_id = v_lot.seller_id
    )
    AND status IN ('pending', 'reviewing')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_seller_deposit_lot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_seller_deposit_lot_updated_at ON seller_deposit_lots;
CREATE TRIGGER trigger_update_seller_deposit_lot_updated_at
  BEFORE UPDATE ON seller_deposit_lots
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_deposit_lot_updated_at();

-- Indexes
CREATE INDEX idx_seller_deposit_lots_seller_status ON seller_deposit_lots(seller_id, status);
CREATE INDEX idx_seller_deposit_lots_refundable_at ON seller_deposit_lots(refundable_at) WHERE status = 'refundable';
CREATE INDEX idx_products_seller_payment_enabled ON products(seller_id, payment_enabled);
