-- Add is_deleted for message retract (soft delete)
-- Retracted messages remain in DB but are hidden from UI

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_is_deleted ON messages(conversation_id, is_deleted)
  WHERE is_deleted = false;

COMMENT ON COLUMN messages.is_deleted IS 'True when message was retracted by sender within 5 min window';
