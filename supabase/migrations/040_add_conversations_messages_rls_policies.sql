-- RLS policies for conversations & messages updates
-- Needed for creating/reading private conversations and updating read status / last_message fields.

-- Conversations: allow participants to SELECT/INSERT/UPDATE/DELETE their own private/support conversations
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT
  USING (
    participant1_id = auth.uid()
    OR participant2_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
  );

DROP POLICY IF EXISTS "Users can create private conversations" ON conversations;
CREATE POLICY "Users can create private conversations" ON conversations
  FOR INSERT
  WITH CHECK (
    conversation_type = 'private'
    AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
CREATE POLICY "Users can update own conversations" ON conversations
  FOR UPDATE
  USING (
    participant1_id = auth.uid()
    OR participant2_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
  );

DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;
CREATE POLICY "Users can delete own conversations" ON conversations
  FOR DELETE
  USING (
    participant1_id = auth.uid()
    OR participant2_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Messages: allow participants to UPDATE read markers (is_read/read_at) for messages in conversations they belong to
DROP POLICY IF EXISTS "Users can update read status in own conversations" ON messages;
CREATE POLICY "Users can update read status in own conversations" ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND (conversations.participant1_id = auth.uid() OR conversations.participant2_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND (conversations.participant1_id = auth.uid() OR conversations.participant2_id = auth.uid())
    )
  );

