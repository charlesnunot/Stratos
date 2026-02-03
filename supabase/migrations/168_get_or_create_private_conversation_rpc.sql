-- Get or create private conversation: single source of truth in DB.
-- Fixes: client .or() filter not matching existing rows → duplicate INSERT → unique constraint.
-- Caller must be authenticated; p_other_id is the other participant.

CREATE OR REPLACE FUNCTION public.get_or_create_private_conversation(p_other_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  IF p_other_id = v_uid THEN
    RAISE EXCEPTION 'Cannot create conversation with self';
  END IF;

  -- Symmetric lookup: (me, other) OR (other, me)
  SELECT id INTO v_id
  FROM conversations
  WHERE conversation_type = 'private'
    AND (
      (participant1_id = v_uid AND participant2_id = p_other_id)
      OR (participant1_id = p_other_id AND participant2_id = v_uid)
    )
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Insert; on unique violation (race), select again
  BEGIN
    INSERT INTO conversations (participant1_id, participant2_id, conversation_type, last_message_at)
    VALUES (v_uid, p_other_id, 'private', now())
    RETURNING id INTO v_id;
    RETURN v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_id
      FROM conversations
      WHERE conversation_type = 'private'
        AND (
          (participant1_id = v_uid AND participant2_id = p_other_id)
          OR (participant1_id = p_other_id AND participant2_id = v_uid)
        )
      LIMIT 1;
      RETURN v_id;
  END;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_private_conversation(uuid) IS
  'Returns existing private conversation id or creates one. Caller = auth.uid(); other = p_other_id. Idempotent under concurrent calls.';
