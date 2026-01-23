-- Optimize comment notification triggers with deduplication
-- Prevent duplicate notifications when user rapidly comments/replies
-- This improves data quality and user experience

-- Optimize comment notification trigger with deduplication
CREATE OR REPLACE FUNCTION create_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
  parent_comment_author_id UUID;
  commenter_profile RECORD;
  notification_user_id UUID;
  notification_title TEXT;
  notification_content TEXT;
  existing_notification_id UUID;
BEGIN
  -- Get post author ID
  SELECT user_id INTO post_author_id
  FROM posts
  WHERE id = NEW.post_id;

  -- Get commenter profile info
  SELECT display_name, username INTO commenter_profile
  FROM profiles
  WHERE id = NEW.user_id;

  -- Determine notification target and content
  IF NEW.parent_id IS NOT NULL THEN
    -- This is a reply to a comment
    SELECT user_id INTO parent_comment_author_id
    FROM comments
    WHERE id = NEW.parent_id;

    -- If parent comment doesn't exist or was deleted, skip
    IF parent_comment_author_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Avoid notifying when replying to own comment
    IF parent_comment_author_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- If replying to post author's comment, skip (post author already gets comment notification)
    IF parent_comment_author_id = post_author_id THEN
      RETURN NEW;
    END IF;

    -- Send reply notification to parent comment author
    notification_user_id := parent_comment_author_id;
    notification_title := '您的评论收到回复';
    notification_content := COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户') || ' 回复了您的评论';
  ELSE
    -- This is a direct comment on the post
    -- Avoid notifying when commenting on own post
    IF post_author_id = NEW.user_id THEN
      RETURN NEW;
    END IF;

    -- Send comment notification to post author
    notification_user_id := post_author_id;
    notification_title := '您的帖子收到评论';
    notification_content := COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户') || ' 评论了您的帖子';
  END IF;

  -- Check for existing notification in the last 5 seconds (deduplication)
  -- This prevents duplicate notifications from rapid comments/replies
  SELECT id INTO existing_notification_id
  FROM notifications
  WHERE user_id = notification_user_id
    AND type = 'comment'
    AND related_id = NEW.post_id
    AND related_type = 'post'
    AND actor_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '5 seconds'
  LIMIT 1;

  -- If notification already exists recently, skip creating a new one
  IF existing_notification_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Create notification
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
    notification_user_id,
    'comment',
    notification_title,
    notification_content,
    NEW.post_id,
    'post',
    '/post/' || NEW.post_id::text,
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger is already created in 025_add_comment_notification_trigger.sql
-- No need to recreate it, the function replacement will update the behavior
