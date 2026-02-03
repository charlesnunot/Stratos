-- 加速 get_or_create_private_conversation 的对称查询：
-- WHERE conversation_type = 'private' AND ((p1=A AND p2=B) OR (p1=B AND p2=A))
-- 10 秒内必达：减少 Message seller 点击到聊天页的等待时间。

CREATE INDEX IF NOT EXISTS idx_conversations_private_p1_p2
  ON public.conversations (conversation_type, participant1_id, participant2_id)
  WHERE conversation_type = 'private';

COMMENT ON INDEX idx_conversations_private_p1_p2 IS
  'Speeds up symmetric lookup (A,B) or (B,A) for get_or_create_private_conversation';
