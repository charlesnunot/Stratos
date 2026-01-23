-- Create order disputes and refunds tables
-- This migration creates tables for handling order disputes and refunds

-- Create order_disputes table
CREATE TABLE IF NOT EXISTS order_disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  dispute_type TEXT NOT NULL CHECK (dispute_type IN ('seller_not_shipping', 'quality_issue', 'wrong_item', 'refund_request', 'other')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'rejected')),
  initiated_by UUID REFERENCES profiles(id) NOT NULL,
  initiated_by_type TEXT NOT NULL CHECK (initiated_by_type IN ('buyer', 'seller', 'admin', 'system')),
  reason TEXT NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb, -- Array of image URLs or evidence documents
  seller_response TEXT,
  seller_responded_at TIMESTAMPTZ,
  resolution TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create order_refunds table
CREATE TABLE IF NOT EXISTS order_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  dispute_id UUID REFERENCES order_disputes(id),
  refund_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  refund_reason TEXT NOT NULL,
  refund_method TEXT CHECK (refund_method IN ('original_payment', 'bank_transfer', 'platform_refund')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  refunded_at TIMESTAMPTZ,
  refund_transaction_id UUID REFERENCES payment_transactions(id),
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add shipping timeout fields to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ship_by_date TIMESTAMPTZ, -- Should ship by this date (7 days after payment)
  ADD COLUMN IF NOT EXISTS auto_dispute_at TIMESTAMPTZ; -- Auto-create dispute if not shipped by this date

-- Function to calculate ship_by_date when order is paid
CREATE OR REPLACE FUNCTION calculate_ship_by_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Set ship_by_date to 7 days after payment
  IF NEW.payment_status = 'paid' AND OLD.payment_status != 'paid' THEN
    NEW.ship_by_date := NEW.paid_at + INTERVAL '7 days';
    NEW.auto_dispute_at := NEW.paid_at + INTERVAL '7 days';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set ship_by_date when order is paid
DROP TRIGGER IF EXISTS trigger_calculate_ship_by_date ON orders;
CREATE TRIGGER trigger_calculate_ship_by_date
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION calculate_ship_by_date();

-- Function to auto-create dispute for shipping timeout
CREATE OR REPLACE FUNCTION auto_create_shipping_dispute()
RETURNS VOID AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Find orders that should have been shipped but weren't
  FOR v_order IN
    SELECT id, buyer_id, seller_id
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
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_order_dispute_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_order_refund_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_update_order_dispute_updated_at ON order_disputes;
CREATE TRIGGER trigger_update_order_dispute_updated_at
  BEFORE UPDATE ON order_disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_order_dispute_updated_at();

DROP TRIGGER IF EXISTS trigger_update_order_refund_updated_at ON order_refunds;
CREATE TRIGGER trigger_update_order_refund_updated_at
  BEFORE UPDATE ON order_refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_order_refund_updated_at();

-- Indexes for efficient queries
CREATE INDEX idx_order_disputes_order_id ON order_disputes(order_id);
CREATE INDEX idx_order_disputes_status ON order_disputes(status);
CREATE INDEX idx_order_disputes_initiated_by ON order_disputes(initiated_by);
CREATE INDEX idx_order_refunds_order_id ON order_refunds(order_id);
CREATE INDEX idx_order_refunds_dispute_id ON order_refunds(dispute_id);
CREATE INDEX idx_order_refunds_status ON order_refunds(status);
CREATE INDEX idx_orders_ship_by_date ON orders(ship_by_date) WHERE payment_status = 'paid';
