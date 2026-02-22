-- Fix: follows 表列为 followee_id/follower_id，无 following_id。
-- 修正 195 中 notify_followers_on_post_approval 使用的列名，避免帖子审核通过时报错。
CREATE OR REPLACE FUNCTION notify_followers_on_post_approval()
RETURNS TRIGGER AS $$
DECLARE
  follower RECORD;
  post_author_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  post_preview TEXT;
  content_params JSONB;
  follower_count INT := 0;
  max_notifications INT := 1000;
BEGIN
  IF OLD.status != 'pending' OR NEW.status != 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT display_name, username INTO post_author_profile 
  FROM profiles 
  WHERE id = NEW.user_id;

  IF post_author_profile IS NULL THEN
    RAISE WARNING 'notify_followers_on_post_approval: Author profile not found for user_id: %', NEW.user_id;
    RETURN NEW;
  END IF;

  IF NEW.content IS NOT NULL AND LENGTH(NEW.content) > 0 THEN
    post_preview := CASE 
      WHEN LENGTH(NEW.content) > 30 THEN LEFT(NEW.content, 30) || '...' 
      ELSE NEW.content 
    END;
  ELSE
    post_preview := '[图片帖子]';
  END IF;

  notification_title := '新帖子';
  notification_content := COALESCE(post_author_profile.display_name, post_author_profile.username, '某用户') || ' 发布了新帖子';
  notification_link := '/post/' || NEW.id::TEXT;
  content_params := jsonb_build_object(
    'actorName', COALESCE(post_author_profile.display_name, post_author_profile.username, '某用户'),
    'preview', post_preview
  );

  FOR follower IN 
    SELECT follower_id 
    FROM follows 
    WHERE followee_id = NEW.user_id
    LIMIT max_notifications
  LOOP
    BEGIN
      INSERT INTO notifications (
        user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params
      )
      VALUES (
        follower.follower_id, 'system', notification_title, notification_content,
        NEW.id::UUID, 'post', notification_link, NEW.user_id, 'following_new_post', content_params
      );
      follower_count := follower_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_followers_on_post_approval: Failed to notify follower_id: %, error: %', follower.follower_id, SQLERRM;
    END;
  END LOOP;

  IF follower_count > 0 THEN
    RAISE NOTICE 'notify_followers_on_post_approval: Notified % followers for post_id: %', follower_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION notify_followers_on_post_approval() IS '当帖子审核通过后，通知作者的所有粉丝。使用 follows.followee_id（修正原 following_id 列名错误）。';
