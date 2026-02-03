-- Optimize conversations table with proper indexes
-- Focus on private conversations which are most frequently used

-- Symmetric index using LEAST/GREATEST for fast bidirectional lookups
-- This allows efficient lookup regardless of which participant is which
CREATE INDEX IF NOT EXISTS idx_conversations_symmetric
ON conversations(
    LEAST(participant1_id, participant2_id),
    GREATEST(participant1_id, participant2_id)
);

-- Index for faster message queries within conversations
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
ON messages(conversation_id, created_at DESC);

-- Analyze the tables to ensure the new indexes are properly utilized
ANALYZE conversations;
ANALYZE messages;