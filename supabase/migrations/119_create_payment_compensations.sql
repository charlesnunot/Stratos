-- Create payment_compensations table to track compensation transfers
-- For cases where payment succeeded but transfer failed after max retries

CREATE TABLE IF NOT EXISTS payment_compensations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  transfer_id UUID REFERENCES payment_transfers(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('stripe', 'paypal', 'alipay', 'wechat', 'bank')),
  reason TEXT NOT NULL, -- Reason for compensation
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payment_compensations_order_id ON payment_compensations(order_id);
CREATE INDEX idx_payment_compensations_seller_id ON payment_compensations(seller_id);
CREATE INDEX idx_payment_compensations_status ON payment_compensations(status);
CREATE INDEX idx_payment_compensations_created_at ON payment_compensations(created_at DESC);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_payment_compensation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_payment_compensation_updated_at ON payment_compensations;
CREATE TRIGGER trigger_update_payment_compensation_updated_at
  BEFORE UPDATE ON payment_compensations
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_compensation_updated_at();
