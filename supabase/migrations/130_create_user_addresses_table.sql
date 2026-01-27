-- Create user_addresses table for managing user shipping addresses
-- This allows users to save and reuse multiple addresses

CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT, -- Address label: 家庭 (Home), 工作 (Work), 其他 (Other), etc.
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL,
  state TEXT,
  city TEXT,
  street_address TEXT NOT NULL,
  postal_code TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_user_addresses_user_id ON user_addresses(user_id);
CREATE INDEX idx_user_addresses_user_id_default ON user_addresses(user_id, is_default) WHERE is_default = true;

-- Add RLS policies
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own addresses
CREATE POLICY "Users can view their own addresses"
  ON user_addresses
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own addresses
CREATE POLICY "Users can insert their own addresses"
  ON user_addresses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own addresses
CREATE POLICY "Users can update their own addresses"
  ON user_addresses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own addresses
CREATE POLICY "Users can delete their own addresses"
  ON user_addresses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to ensure only one default address per user
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this address as default, unset all other default addresses for this user
  IF NEW.is_default = true THEN
    UPDATE user_addresses
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to ensure only one default address per user
CREATE TRIGGER ensure_single_default_address_trigger
  BEFORE INSERT OR UPDATE ON user_addresses
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_address();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_user_addresses_updated_at_trigger
  BEFORE UPDATE ON user_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_user_addresses_updated_at();

-- Add comments
COMMENT ON TABLE user_addresses IS 'User shipping addresses for order checkout';
COMMENT ON COLUMN user_addresses.label IS 'Address label for user identification (e.g., 家庭, 工作, 其他)';
COMMENT ON COLUMN user_addresses.is_default IS 'Whether this is the default address for the user (only one default per user)';
