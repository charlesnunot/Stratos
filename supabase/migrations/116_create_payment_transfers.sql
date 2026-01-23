-- Create payment_transfers table to track all transfers to sellers
-- Records all money transfers from platform to sellers/recipients

CREATE TABLE IF NOT EXISTS payment_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  transfer_method TEXT NOT NULL CHECK (transfer_method IN ('stripe', 'paypal', 'alipay', 'wechat', 'bank', 'stripe_connect')),
  transfer_ref TEXT, -- External transfer reference (e.g., Stripe transfer ID, PayPal payout ID)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message TEXT, -- Error message if transfer failed
  transferred_at TIMESTAMPTZ, -- When transfer was actually completed
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional transfer metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_payment_transfers_seller_id ON payment_transfers(seller_id);
CREATE INDEX idx_payment_transfers_payment_transaction_id ON payment_transfers(payment_transaction_id);
CREATE INDEX idx_payment_transfers_status ON payment_transfers(status);
CREATE INDEX idx_payment_transfers_transfer_method ON payment_transfers(transfer_method);
CREATE INDEX idx_payment_transfers_created_at ON payment_transfers(created_at DESC);

-- Index for finding transfers by external reference
CREATE INDEX idx_payment_transfers_transfer_ref ON payment_transfers(transfer_ref) WHERE transfer_ref IS NOT NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_transfer_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_payment_transfer_updated_at ON payment_transfers;
CREATE TRIGGER trigger_update_payment_transfer_updated_at
  BEFORE UPDATE ON payment_transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_transfer_updated_at();

-- Function to get total transferred amount for a seller
CREATE OR REPLACE FUNCTION get_seller_total_transferred(
  p_seller_id UUID,
  p_currency TEXT DEFAULT NULL
)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total
  FROM payment_transfers
  WHERE seller_id = p_seller_id
    AND status = 'completed'
    AND (p_currency IS NULL OR currency = p_currency);

  RETURN COALESCE(v_total, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
