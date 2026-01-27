-- Add constraints to prevent self-actions (follow self, chat self, etc.)
-- ✅ 修复 P1: 添加数据库约束防止自己关注自己、自己给自己发私信等

-- ============================================
-- 1. Add constraint to prevent following yourself
-- ============================================

-- Check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'follows_no_self_follow_check'
  ) THEN
    ALTER TABLE public.follows
    ADD CONSTRAINT follows_no_self_follow_check
    CHECK (follower_id != followee_id);
    
    COMMENT ON CONSTRAINT follows_no_self_follow_check ON public.follows 
    IS 'Prevent users from following themselves';
  END IF;
END $$;

-- ============================================
-- 2. Add constraint to prevent self-conversations
-- ============================================

-- Check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'conversations_no_self_chat_check'
  ) THEN
    ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_no_self_chat_check
    CHECK (
      conversation_type != 'private' OR participant1_id != participant2_id
    );
    
    COMMENT ON CONSTRAINT conversations_no_self_chat_check ON public.conversations 
    IS 'Prevent users from creating private conversations with themselves';
  END IF;
END $$;

-- ============================================
-- 3. Add constraint to prevent blocking yourself
-- ============================================

-- Check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'blocked_users_no_self_block_check'
  ) THEN
    ALTER TABLE public.blocked_users
    ADD CONSTRAINT blocked_users_no_self_block_check
    CHECK (blocker_id != blocked_id);
    
    COMMENT ON CONSTRAINT blocked_users_no_self_block_check ON public.blocked_users 
    IS 'Prevent users from blocking themselves';
  END IF;
END $$;

-- ============================================
-- 4. Add constraint to prevent restricting yourself
-- ============================================

-- Check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'restricted_view_users_no_self_restrict_check'
  ) THEN
    ALTER TABLE public.restricted_view_users
    ADD CONSTRAINT restricted_view_users_no_self_restrict_check
    CHECK (restrictor_id != restricted_id);
    
    COMMENT ON CONSTRAINT restricted_view_users_no_self_restrict_check ON public.restricted_view_users 
    IS 'Prevent users from restricting themselves';
  END IF;
END $$;
