-- Create blocked_users table for user blocking functionality
-- This allows users to block other users, preventing them from:
-- - Following the blocker
-- - Sending messages to the blocker
-- - Tipping the blocker's posts

CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON blocked_users(blocked_id);

-- Enable RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own block list (who they blocked)
CREATE POLICY "Users can view own blocked list" ON blocked_users
  FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can block other users
CREATE POLICY "Users can block others" ON blocked_users
  FOR INSERT
  WITH CHECK (auth.uid() = blocker_id AND auth.uid() != blocked_id);

-- Users can unblock users they blocked
CREATE POLICY "Users can unblock others" ON blocked_users
  FOR DELETE
  USING (auth.uid() = blocker_id);

-- Add comments
COMMENT ON TABLE blocked_users IS 'User blocking relationships. blocker_id is the user who blocked, blocked_id is the user who was blocked.';
COMMENT ON COLUMN blocked_users.blocker_id IS 'The user who initiated the block';
COMMENT ON COLUMN blocked_users.blocked_id IS 'The user who was blocked';
