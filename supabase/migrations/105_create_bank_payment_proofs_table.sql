-- Create bank_payment_proofs table for bank transfer payment verification
-- This table stores uploaded proof documents for bank transfer payments

CREATE TABLE bank_payment_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  proof_image_url TEXT NOT NULL, -- URL to uploaded proof image
  bank_name TEXT,
  transaction_number TEXT, -- Bank transaction reference number
  transfer_amount DECIMAL(10,2),
  transfer_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by order_id
CREATE INDEX idx_bank_payment_proofs_order_id 
  ON bank_payment_proofs(order_id);

-- Index for querying by payment_transaction_id
CREATE INDEX idx_bank_payment_proofs_transaction_id 
  ON bank_payment_proofs(payment_transaction_id);

-- Index for querying by status
CREATE INDEX idx_bank_payment_proofs_status 
  ON bank_payment_proofs(status);

-- Index for querying by uploaded_by
CREATE INDEX idx_bank_payment_proofs_uploaded_by 
  ON bank_payment_proofs(uploaded_by);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bank_payment_proof_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_bank_payment_proof_updated_at
  BEFORE UPDATE ON bank_payment_proofs
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_payment_proof_updated_at();

-- RLS Policies
ALTER TABLE bank_payment_proofs ENABLE ROW LEVEL SECURITY;

-- Users can view their own uploaded proofs
CREATE POLICY "Users can view own payment proofs" ON bank_payment_proofs
  FOR SELECT USING (
    uploaded_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- Users can insert their own proofs
CREATE POLICY "Users can insert own payment proofs" ON bank_payment_proofs
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- Only admins can update proofs (for approval/rejection)
CREATE POLICY "Admins can update payment proofs" ON bank_payment_proofs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- Comment
COMMENT ON TABLE bank_payment_proofs IS 'Stores uploaded proof documents for bank transfer payment verification';
