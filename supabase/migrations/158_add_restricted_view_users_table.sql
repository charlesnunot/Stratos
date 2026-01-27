-- Create restricted_view_users table for "不让他看" functionality
-- This allows users to restrict specific users from viewing their profile/content
-- Different from blocking: blocking prevents the blocked user from interacting with you
-- Restricting view prevents the restricted user from seeing your content, but you can still see theirs

CREATE TABLE IF NOT EXISTS restricted_view_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restrictor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restricted_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restrictor_id, restricted_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_restricted_view_users_restrictor_id ON restricted_view_users(restrictor_id);
CREATE INDEX IF NOT EXISTS idx_restricted_view_users_restricted_id ON restricted_view_users(restricted_id);

-- Enable RLS
ALTER TABLE restricted_view_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own restriction list (who they restricted)
CREATE POLICY "Users can view own restriction list" ON restricted_view_users
  FOR SELECT
  USING (auth.uid() = restrictor_id);

-- Users can restrict others from viewing their content
CREATE POLICY "Users can restrict others" ON restricted_view_users
  FOR INSERT
  WITH CHECK (auth.uid() = restrictor_id AND auth.uid() != restricted_id);

-- Users can un-restrict users they restricted
CREATE POLICY "Users can un-restrict others" ON restricted_view_users
  FOR DELETE
  USING (auth.uid() = restrictor_id);

-- Add comments
COMMENT ON TABLE restricted_view_users IS 'User view restriction relationships. restrictor_id is the user who restricts, restricted_id is the user who is restricted from viewing.';
COMMENT ON COLUMN restricted_view_users.restrictor_id IS 'The user who initiated the restriction';
COMMENT ON COLUMN restricted_view_users.restricted_id IS 'The user who is restricted from viewing';
