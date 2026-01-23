-- Create seller_debts table for tracking platform advances (when platform pays refunds)
-- This tracks debts when platform advances refunds that sellers should pay back

CREATE TABLE IF NOT EXISTS seller_debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  dispute_id UUID REFERENCES order_disputes(id),
  refund_id UUID REFERENCES order_refunds(id),
  debt_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  debt_reason TEXT NOT NULL, -- e.g., 'Platform advanced refund'
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'collected', 'forgiven')),
  collected_at TIMESTAMPTZ,
  collection_method TEXT, -- 'deposit_deduction', 'payout_deduction', 'manual'
  payment_transaction_id UUID REFERENCES payment_transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to create debt when platform advances refund
CREATE OR REPLACE FUNCTION create_seller_debt(
  p_seller_id UUID,
  p_order_id UUID,
  p_dispute_id UUID,
  p_refund_id UUID,
  p_amount DECIMAL,
  p_currency TEXT,
  p_reason TEXT
)
RETURNS UUID AS $$
DECLARE
  v_debt_id UUID;
BEGIN
  INSERT INTO seller_debts (
    seller_id,
    order_id,
    dispute_id,
    refund_id,
    debt_amount,
    currency,
    debt_reason
  ) VALUES (
    p_seller_id,
    p_order_id,
    p_dispute_id,
    p_refund_id,
    p_amount,
    p_currency,
    p_reason
  ) RETURNING id INTO v_debt_id;

  RETURN v_debt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get total debt for a seller
CREATE OR REPLACE FUNCTION get_seller_total_debt(p_seller_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total_debt DECIMAL;
BEGIN
  SELECT COALESCE(SUM(debt_amount), 0)
  INTO v_total_debt
  FROM seller_debts
  WHERE seller_id = p_seller_id
    AND status = 'pending';

  RETURN v_total_debt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_seller_debt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_seller_debt_updated_at ON seller_debts;
CREATE TRIGGER trigger_update_seller_debt_updated_at
  BEFORE UPDATE ON seller_debts
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_debt_updated_at();

-- Indexes
CREATE INDEX idx_seller_debts_seller_status ON seller_debts(seller_id, status);
CREATE INDEX idx_seller_debts_order_id ON seller_debts(order_id);
CREATE INDEX idx_seller_debts_dispute_id ON seller_debts(dispute_id);
CREATE INDEX idx_seller_debts_refund_id ON seller_debts(refund_id);
