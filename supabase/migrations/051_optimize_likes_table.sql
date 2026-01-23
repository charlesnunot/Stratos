-- Optimize likes table: add indexes, rate limiting, and improve notification trigger
-- This migration improves performance, security, and data quality for post likes

-- 1. Add user_id index for better query performance when checking if user has liked
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);

-- 2. Add like rate limiting to prevent spam/abuse
-- Allow at most 20 likes per user within 60 seconds
CREATE OR REPLACE FUNCTION public.enforce_like_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.likes
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '60 seconds';
  
  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded for likes'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_enforce_like_rate_limit ON public.likes;
CREATE TRIGGER trigger_enforce_like_rate_limit
  BEFORE INSERT ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_like_rate_limit();

-- 3. Optimize like notification trigger with deduplication
-- Prevent duplicate notifications when user rapidly clicks like/unlike
CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
  liker_profile RECORD;
  existing_notification_id UUID;
BEGIN
  -- Get post author ID
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Avoid notifying when liking own post
  IF post_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Check for existing notification in the last 5 seconds (deduplication)
  -- This prevents duplicate notifications from rapid clicks
  SELECT id INTO existing_notification_id
  FROM notifications
  WHERE user_id = post_author_id
    AND type = 'like'
    AND related_id = NEW.post_id
    AND related_type = 'post'
    AND actor_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '5 seconds'
  LIMIT 1;

  -- If notification already exists recently, skip creating a new one
  IF existing_notification_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get liker profile info
  SELECT display_name, username INTO liker_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- Create like notification
  INSERT INTO notifications (
    user_id,
    type,
    title,
    content,
    related_id,
    related_type,
    link,
    actor_id
  )
  VALUES (
    post_author_id,
    'like',
    '您的帖子收到点赞',
    COALESCE(liker_profile.display_name, liker_profile.username, '某用户') || ' 点赞了您的帖子',
    NEW.post_id,
    'post',
    '/post/' || NEW.post_id::text,
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger is already created in 021_add_like_notification_trigger.sql
-- No need to recreate it, the function replacement will update the behavior
