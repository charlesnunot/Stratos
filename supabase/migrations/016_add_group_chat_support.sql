-- Add group chat support to conversations table
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_members INT DEFAULT 100;

-- Update conversation_type to include 'group'
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_conversation_type_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_conversation_type_check
  CHECK (conversation_type IN ('private', 'support', 'group'));

-- Create group_members table
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(group_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_owner_id ON conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type);

-- Add comments
COMMENT ON COLUMN conversations.name IS 'Group name (only for group conversations)';
COMMENT ON COLUMN conversations.owner_id IS 'Group owner ID (only for group conversations)';
COMMENT ON COLUMN group_members.role IS 'Member role: owner, admin, or member';
