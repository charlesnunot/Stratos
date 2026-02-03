-- Extend conversations and messages RLS so group members (not only owner) can view and use group chats.
-- Group conversations use participant1_id=participant2_id=owner; we add group_members as allowed viewers.

-- Conversations: SELECT/UPDATE (and DELETE for consistency) allow group members
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT
  USING (
    participant1_id = auth.uid()
    OR participant2_id = auth.uid()
    OR (
      conversation_type = 'group'
      AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = conversations.id
          AND user_id = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
  );

DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
CREATE POLICY "Users can update own conversations" ON conversations
  FOR UPDATE
  USING (
    participant1_id = auth.uid()
    OR participant2_id = auth.uid()
    OR (
      conversation_type = 'group'
      AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = conversations.id
          AND user_id = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
  );

DROP POLICY IF EXISTS "Users can delete own conversations" ON conversations;
CREATE POLICY "Users can delete own conversations" ON conversations
  FOR DELETE
  USING (
    participant1_id = auth.uid()
    OR participant2_id = auth.uid()
    OR (
      conversation_type = 'group'
      AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = conversations.id
          AND user_id = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Messages: SELECT - allow if user is participant or group member of the conversation
DROP POLICY IF EXISTS "Users can view own conversations" ON messages;
CREATE POLICY "Users can view own conversations" ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.participant1_id = auth.uid()
        OR c.participant2_id = auth.uid()
        OR (
          c.conversation_type = 'group'
          AND EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = c.id
              AND gm.user_id = auth.uid()
          )
        )
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'support'))
  );

-- Messages: INSERT - allow if user is participant or group member
DROP POLICY IF EXISTS "Users can send messages in own conversations" ON messages;
CREATE POLICY "Users can send messages in own conversations" ON messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id = messages.conversation_id
        AND (
          c.participant1_id = auth.uid()
          OR c.participant2_id = auth.uid()
          OR (
            c.conversation_type = 'group'
            AND EXISTS (
              SELECT 1 FROM group_members gm
              WHERE gm.group_id = c.id
                AND gm.user_id = auth.uid()
            )
          )
        )
      )
    )
  );

-- Messages: UPDATE (read status) - allow if user is participant or group member
DROP POLICY IF EXISTS "Users can update read status in own conversations" ON messages;
CREATE POLICY "Users can update read status in own conversations" ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.participant1_id = auth.uid()
        OR c.participant2_id = auth.uid()
        OR (
          c.conversation_type = 'group'
          AND EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = c.id
              AND gm.user_id = auth.uid()
          )
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.participant1_id = auth.uid()
        OR c.participant2_id = auth.uid()
        OR (
          c.conversation_type = 'group'
          AND EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = c.id
              AND gm.user_id = auth.uid()
          )
        )
      )
    )
  );

COMMENT ON POLICY "Users can view own conversations" ON conversations IS 'Participants or group members can view; admin/support can view all.';
COMMENT ON POLICY "Users can view own conversations" ON messages IS 'Participants or group members can view messages; admin/support can view all.';
