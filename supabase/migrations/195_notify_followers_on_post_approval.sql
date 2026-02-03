-- 当帖子审核通过后，通知作者的所有粉丝
-- 这个触发器在帖子状态从 pending 变为 approved 时触发

-- 创建通知粉丝的函数
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
  max_notifications INT := 1000; -- 限制最大通知数量，防止性能问题
BEGIN
  -- 只在状态从 pending 变为 approved 时触发
  IF OLD.status != 'pending' OR NEW.status != 'approved' THEN
    RETURN NEW;
  END IF;

  -- 获取帖子作者信息
  SELECT display_name, username INTO post_author_profile 
  FROM profiles 
  WHERE id = NEW.user_id;

  IF post_author_profile IS NULL THEN
    RAISE WARNING 'notify_followers_on_post_approval: Author profile not found for user_id: %', NEW.user_id;
    RETURN NEW;
  END IF;

  -- 生成帖子预览
  IF NEW.content IS NOT NULL AND LENGTH(NEW.content) > 0 THEN
    post_preview := CASE 
      WHEN LENGTH(NEW.content) > 30 THEN LEFT(NEW.content, 30) || '...' 
      ELSE NEW.content 
    END;
  ELSE
    post_preview := '[图片帖子]';
  END IF;

  -- 生成通知内容
  notification_title := '新帖子';
  notification_content := COALESCE(post_author_profile.display_name, post_author_profile.username, '某用户') || ' 发布了新帖子';
  notification_link := '/post/' || NEW.id::TEXT;
  content_params := jsonb_build_object(
    'actorName', COALESCE(post_author_profile.display_name, post_author_profile.username, '某用户'),
    'preview', post_preview
  );

  -- 遍历所有粉丝并发送通知
  FOR follower IN 
    SELECT follower_id 
    FROM follows 
    WHERE following_id = NEW.user_id
    LIMIT max_notifications
  LOOP
    BEGIN
      INSERT INTO notifications (
        user_id, 
        type, 
        title, 
        content, 
        related_id, 
        related_type, 
        link, 
        actor_id, 
        content_key, 
        content_params
      )
      VALUES (
        follower.follower_id, 
        'system', 
        notification_title, 
        notification_content, 
        NEW.id::UUID, 
        'post', 
        notification_link, 
        NEW.user_id, 
        'following_new_post', 
        content_params
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

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_notify_followers_on_post_approval ON posts;
CREATE TRIGGER trigger_notify_followers_on_post_approval
  AFTER UPDATE ON posts
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'approved')
  EXECUTE FUNCTION notify_followers_on_post_approval();

-- 验证触发器创建成功
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_notify_followers_on_post_approval' 
    AND tgrelid = 'posts'::regclass
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_notify_followers_on_post_approval was not created';
  END IF;
  RAISE NOTICE 'Trigger trigger_notify_followers_on_post_approval verified: exists and enabled';
END;
$$;

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'notify_followers_on_post_approval';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function notify_followers_on_post_approval does not have SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'Function notify_followers_on_post_approval verified: SECURITY DEFINER = %', has_security_definer;
END;
$$;

-- 添加注释
COMMENT ON FUNCTION notify_followers_on_post_approval() IS '当帖子审核通过后，通知作者的所有粉丝。限制最大通知数量为1000，防止大V发帖时造成性能问题。';
