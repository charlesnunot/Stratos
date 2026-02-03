-- Extend get_or_create_private_conversation: reject when caller has blocked the other user.
-- Ensures "A blocks B" prevents A from opening/creating a chat with B (consistent with messages API).

CREATE OR REPLACE FUNCTION public.get_or_create_private_conversation(p_other_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_other_status text;
  v_blocked boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;
  IF p_other_id = v_uid THEN
    RAISE EXCEPTION 'Cannot create conversation with self';
  END IF;

  -- Check target user status (banned/suspended cannot receive messages)
  SELECT status INTO v_other_status
  FROM public.profiles
  WHERE id = p_other_id;
  IF v_other_status IN ('banned', 'suspended') THEN
    RAISE EXCEPTION 'Cannot send message to banned or suspended user';
  END IF;

  -- Check if current user is blocked by the other user
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE blocker_id = p_other_id AND blocked_id = v_uid
  ) INTO v_blocked;
  IF v_blocked THEN
    RAISE EXCEPTION 'You have been blocked by this user';
  END IF;

  -- Check if current user has blocked the other (blocker must not open chat with blocked user)
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE blocker_id = v_uid AND blocked_id = p_other_id
  ) INTO v_blocked;
  IF v_blocked THEN
    RAISE EXCEPTION 'You have blocked this user';
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
  'Returns existing private conversation id or creates one. Checks other user status, other blocked me, and I blocked other; caller = auth.uid(), other = p_other_id.';
