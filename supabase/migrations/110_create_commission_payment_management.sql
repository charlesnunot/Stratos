-- Create commission payment obligations and seller penalties tables
-- This migration creates tables for tracking commission payment obligations (>5 USD trigger)
-- and seller penalties for overdue payments

-- Create commission_payment_obligations table
CREATE TABLE IF NOT EXISTS commission_payment_obligations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'CNY', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'HKD', 'AUD', 'CAD')),
  due_date TIMESTAMPTZ NOT NULL, -- 7 days from creation
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'penalty')),
  paid_at TIMESTAMPTZ,
  payment_transaction_id UUID REFERENCES payment_transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create seller_penalties table
CREATE TABLE IF NOT EXISTS seller_penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  obligation_id UUID REFERENCES commission_payment_obligations(id),
  penalty_type TEXT NOT NULL CHECK (penalty_type IN ('warning', 'restrict_sales', 'suspend', 'disable')),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to create commission payment obligation when total > 5 USD
CREATE OR REPLACE FUNCTION create_commission_obligation_if_needed()
RETURNS TRIGGER AS $$
DECLARE
  v_total_unpaid DECIMAL(10,2);
  v_currency TEXT;
  v_seller_id UUID;
  v_existing_obligation_id UUID;
BEGIN
  -- Get seller_id from the order
  SELECT o.seller_id, o.currency
  INTO v_seller_id, v_currency
  FROM orders o
  WHERE o.id = NEW.order_id;

  IF v_seller_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate total unpaid commission for this seller
  -- Note: affiliate_commissions table has seller_id indirectly through order
  SELECT COALESCE(SUM(ac.amount), 0)
  INTO v_total_unpaid
  FROM affiliate_commissions ac
  JOIN orders o ON o.id = ac.order_id
  WHERE o.seller_id = v_seller_id
    AND ac.status = 'pending';

  -- Check if there's an existing pending obligation
  SELECT id
  INTO v_existing_obligation_id
  FROM commission_payment_obligations
  WHERE seller_id = v_seller_id
    AND status = 'pending'
  LIMIT 1;

  -- If total > 5 USD (or equivalent in other currencies) and no existing obligation
  IF v_total_unpaid >= 5.00 AND v_existing_obligation_id IS NULL THEN
    INSERT INTO commission_payment_obligations (
      seller_id,
      total_amount,
      currency,
      due_date
    ) VALUES (
      v_seller_id,
      v_total_unpaid,
      COALESCE(v_currency, 'USD'),
      NOW() + INTERVAL '7 days'
    );

    -- Send notification (would be handled by application layer)
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to check commission obligation when affiliate commission is created
DROP TRIGGER IF EXISTS trigger_create_commission_obligation ON affiliate_commissions;
CREATE TRIGGER trigger_create_commission_obligation
  AFTER INSERT ON affiliate_commissions
  FOR EACH ROW
  EXECUTE FUNCTION create_commission_obligation_if_needed();

-- Trigger to check commission obligation when affiliate commission is created
-- Note: This assumes affiliate_commissions table exists
-- If it doesn't exist yet, this trigger will be created in a later migration
-- DROP TRIGGER IF EXISTS trigger_create_commission_obligation ON affiliate_commissions;
-- CREATE TRIGGER trigger_create_commission_obligation
--   AFTER INSERT ON affiliate_commissions
--   FOR EACH ROW
--   EXECUTE FUNCTION create_commission_obligation_if_needed();

-- Function to check penalty history and apply appropriate penalty
CREATE OR REPLACE FUNCTION apply_commission_penalty(
  p_seller_id UUID,
  p_obligation_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_penalty_count INT;
  v_penalty_type TEXT;
  v_penalty_id UUID;
BEGIN
  -- Count existing penalties for this seller
  SELECT COUNT(*)
  INTO v_penalty_count
  FROM seller_penalties
  WHERE seller_id = p_seller_id
    AND status = 'active';

  -- Determine penalty type based on count
  v_penalty_type := CASE
    WHEN v_penalty_count = 0 THEN 'warning'
    WHEN v_penalty_count = 1 THEN 'restrict_sales'
    WHEN v_penalty_count = 2 THEN 'suspend'
    ELSE 'disable'
  END;

  -- Create penalty record
  INSERT INTO seller_penalties (
    seller_id,
    obligation_id,
    penalty_type,
    reason
  ) VALUES (
    p_seller_id,
    p_obligation_id,
    v_penalty_type,
    'Commission payment overdue'
  ) RETURNING id INTO v_penalty_id;

  -- Apply penalty actions (would be handled by application layer)
  -- For 'restrict_sales': Update products to prevent new sales
  -- For 'suspend': Update profile role
  -- For 'disable': Update profile role and disable account

  RETURN v_penalty_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Indexes for efficient queries
CREATE INDEX idx_commission_obligations_seller_status 
  ON commission_payment_obligations(seller_id, status, due_date);

CREATE INDEX idx_commission_obligations_due_date 
  ON commission_payment_obligations(due_date) 
  WHERE status = 'pending';

CREATE INDEX idx_seller_penalties_seller_status 
  ON seller_penalties(seller_id, status);

CREATE INDEX idx_seller_penalties_type 
  ON seller_penalties(penalty_type, status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_commission_obligation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_commission_obligation_updated_at ON commission_payment_obligations;
CREATE TRIGGER trigger_update_commission_obligation_updated_at
  BEFORE UPDATE ON commission_payment_obligations
  FOR EACH ROW
  EXECUTE FUNCTION update_commission_obligation_updated_at();
