-- Create comment-like notification trigger
-- When a user likes a comment/reply, notify that comment's author.
-- Depends on: 019_add_notification_link_field.sql, 023_add_notification_actor_id.sql, 024_fix_notification_insert_policy.sql

CREATE OR REPLACE FUNCTION public.create_comment_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  comment_author_id UUID;
  comment_post_id UUID;
  comment_parent_id UUID;
  liker_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
BEGIN
  -- Load comment meta (author + post)
  SELECT user_id, post_id, parent_id
    INTO comment_author_id, comment_post_id, comment_parent_id
  FROM public.comments
  WHERE id = NEW.comment_id;

  -- Comment not found / deleted
  IF comment_author_id IS NULL OR comment_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Avoid notifying when liking own comment
  IF comment_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Liker info
  SELECT display_name, username INTO liker_profile
  FROM public.profiles
  WHERE id = NEW.user_id;

  notification_title :=
    CASE
      WHEN comment_parent_id IS NULL THEN '您的评论收到点赞'
      ELSE '您的回复收到点赞'
    END;

  notification_content :=
    COALESCE(liker_profile.display_name, liker_profile.username, '某用户') || ' 点赞了您的评论';

  -- Link to post with comment anchor (best-effort)
  notification_link := '/post/' || comment_post_id::text || '#comment-' || NEW.comment_id::text;

  INSERT INTO public.notifications (
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
    comment_author_id,
    'like',
    notification_title,
    notification_content,
    comment_post_id,
    'comment',
    notification_link,
    NEW.user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_comment_like_notification ON public.comment_likes;
CREATE TRIGGER trigger_create_comment_like_notification
  AFTER INSERT ON public.comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_comment_like_notification();

