-- Create bank_account_settings table for platform bank account information
-- This table stores the bank account details that customers should transfer money to

CREATE TABLE bank_account_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_name TEXT NOT NULL, -- Account holder name
  account_number TEXT NOT NULL, -- Bank account number
  bank_name TEXT NOT NULL, -- Bank name
  bank_branch TEXT, -- Bank branch name
  bank_address TEXT, -- Bank address
  swift_code TEXT, -- SWIFT code (for international transfers)
  is_active BOOLEAN DEFAULT true,
  notes TEXT, -- Additional instructions for customers
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default bank account (can be updated later)
INSERT INTO bank_account_settings (account_name, account_number, bank_name, bank_branch, notes)
VALUES (
  'Stratos Platform',
  '1234567890123456',
  '示例银行',
  '示例分行',
  '转账时请在备注中填写订单号，以便我们快速处理您的订单。'
)
ON CONFLICT DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bank_account_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_bank_account_settings_updated_at
  BEFORE UPDATE ON bank_account_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_account_settings_updated_at();

-- RLS Policies
ALTER TABLE bank_account_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage bank account settings
CREATE POLICY "Admins can view bank account settings" ON bank_account_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- Only admins can insert/update bank account settings
CREATE POLICY "Admins can manage bank account settings" ON bank_account_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support')
    )
  );

-- Comment
COMMENT ON TABLE bank_account_settings IS 'Stores platform bank account information for bank transfer payments';
