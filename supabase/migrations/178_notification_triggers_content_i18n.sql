-- Notification triggers: set content_key and content_params for i18n.
-- Frontend resolves with notifications.content.* (en/zh). content kept for backward compatibility.

-- 1. Comment notification (055)
CREATE OR REPLACE FUNCTION create_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
  parent_comment_author_id UUID;
  commenter_profile RECORD;
  notification_user_id UUID;
  notification_title TEXT;
  notification_content TEXT;
  notification_content_key TEXT;
  notification_content_params JSONB;
  existing_notification_id UUID;
BEGIN
  SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  SELECT display_name, username INTO commenter_profile FROM profiles WHERE id = NEW.user_id;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_comment_author_id FROM comments WHERE id = NEW.parent_id;
    IF parent_comment_author_id IS NULL THEN RETURN NEW; END IF;
    IF parent_comment_author_id = NEW.user_id THEN RETURN NEW; END IF;
    IF parent_comment_author_id = post_author_id THEN RETURN NEW; END IF;
    notification_user_id := parent_comment_author_id;
    notification_title := '您的评论收到回复';
    notification_content := COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户') || ' 回复了您的评论';
    notification_content_key := 'reply_to_comment';
    notification_content_params := jsonb_build_object('actorName', COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户'));
  ELSE
    IF post_author_id = NEW.user_id THEN RETURN NEW; END IF;
    notification_user_id := post_author_id;
    notification_title := '您的帖子收到评论';
    notification_content := COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户') || ' 评论了您的帖子';
    notification_content_key := 'comment_on_post';
    notification_content_params := jsonb_build_object('actorName', COALESCE(commenter_profile.display_name, commenter_profile.username, '某用户'));
  END IF;

  SELECT id INTO existing_notification_id FROM notifications
  WHERE user_id = notification_user_id AND type = 'comment' AND related_id = NEW.post_id
    AND related_type = 'post' AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
  IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
  VALUES (notification_user_id, 'comment', notification_title, notification_content, NEW.post_id, 'post', '/post/' || NEW.post_id::text, NEW.user_id, notification_content_key, notification_content_params);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Post review notification (076)
CREATE OR REPLACE FUNCTION create_post_review_notification()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_content TEXT;
  notification_content_key TEXT;
  notification_link TEXT;
BEGIN
  IF OLD.status != 'pending' OR (NEW.status != 'approved' AND NEW.status != 'rejected') THEN RETURN NEW; END IF;
  IF NEW.user_id = NEW.reviewed_by THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' THEN
    notification_title := '您的帖子已通过审核';
    notification_content := '您的帖子已通过审核，现在可以在平台上看到';
    notification_content_key := 'post_approved';
  ELSE
    notification_title := '您的帖子未通过审核';
    notification_content := '很抱歉，您的帖子未通过审核';
    notification_content_key := 'post_rejected';
  END IF;
  notification_link := '/post/' || NEW.id::TEXT;

  BEGIN
    INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
    VALUES (NEW.user_id, 'system', notification_title, notification_content, NEW.id::UUID, 'post', notification_link, NEW.reviewed_by, notification_content_key, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_post_review_notification: Failed to insert notification for post_id: %, user_id: %, error: %', NEW.id, NEW.user_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Report notification (103)
CREATE OR REPLACE FUNCTION create_report_notification()
RETURNS TRIGGER AS $$
DECLARE
  reporter_profile RECORD;
  admin_user RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  reported_type_label TEXT;
  product_name TEXT;
  content_params JSONB;
BEGIN
  SELECT display_name, username INTO reporter_profile FROM profiles WHERE id = NEW.reporter_id;
  IF reporter_profile IS NULL THEN RAISE WARNING 'create_report_notification: Reporter profile not found for user_id: %', NEW.reporter_id; END IF;

  reported_type_label := CASE NEW.reported_type
    WHEN 'post' THEN '帖子' WHEN 'product' THEN '商品' WHEN 'user' THEN '用户' WHEN 'comment' THEN '评论'
    WHEN 'order' THEN '订单' WHEN 'affiliate_post' THEN '带货帖子' WHEN 'tip' THEN '打赏' WHEN 'message' THEN '聊天内容'
    ELSE NEW.reported_type END;

  notification_title := '收到新的举报';
  notification_link := '/admin/reports';

  IF NEW.reported_type = 'product' THEN
    SELECT name INTO product_name FROM products WHERE id = NEW.reported_id::UUID;
    notification_content := COALESCE(reporter_profile.display_name, reporter_profile.username, '某用户') || ' 举报了' || reported_type_label || '《' || COALESCE(product_name, '未知商品') || '》（' || NEW.reason || '）';
  ELSE
    notification_content := COALESCE(reporter_profile.display_name, reporter_profile.username, '某用户') || ' 举报了' || reported_type_label || '（' || NEW.reason || '）';
  END IF;

  content_params := jsonb_build_object('reportedType', NEW.reported_type, 'reason', NEW.reason);

  FOR admin_user IN SELECT id FROM profiles WHERE role IN ('admin', 'support')
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
      VALUES (admin_user.id, 'report', notification_title, notification_content, NEW.id::UUID, 'report', notification_link, NEW.reporter_id, 'report_content', content_params);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_report_notification: Failed to insert notification for admin user_id: %, error: %', admin_user.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Repost notification (099) - two inserts: to target user and to original author
CREATE OR REPLACE FUNCTION create_repost_notification()
RETURNS TRIGGER AS $$
DECLARE
  reposter_profile RECORD;
  original_post_user_id UUID;
  notification_title TEXT;
  notification_content TEXT;
  notification_content_key TEXT;
  notification_link TEXT;
  repost_comment TEXT;
  truncated_comment TEXT;
  content_params JSONB;
  existing_notification_id UUID;
BEGIN
  IF TG_OP != 'INSERT' THEN RETURN NEW; END IF;

  IF NEW.item_type = 'post' THEN
    SELECT user_id INTO original_post_user_id FROM posts WHERE id = NEW.original_item_id::UUID;
  ELSIF NEW.item_type = 'product' THEN
    SELECT seller_id INTO original_post_user_id FROM products WHERE id = NEW.original_item_id::UUID;
  END IF;

  SELECT display_name, username INTO reposter_profile FROM profiles WHERE id = NEW.user_id;

  IF NEW.repost_content IS NOT NULL AND LENGTH(TRIM(NEW.repost_content)) > 0 THEN
    repost_comment := TRIM(NEW.repost_content);
    truncated_comment := CASE WHEN LENGTH(repost_comment) > 100 THEN LEFT(repost_comment, 100) || '...' ELSE repost_comment END;
  ELSE
    truncated_comment := NULL;
  END IF;

  IF NEW.item_type = 'post' THEN notification_link := '/post/' || NEW.original_item_id::TEXT;
  ELSIF NEW.item_type = 'product' THEN notification_link := '/product/' || NEW.original_item_id::TEXT;
  END IF;

  -- To target user
  IF NEW.target_user_id IS NOT NULL AND NEW.user_id != NEW.target_user_id THEN
    SELECT id INTO existing_notification_id FROM notifications
    WHERE user_id = NEW.target_user_id AND type = 'repost' AND related_id = NEW.original_item_id AND related_type = NEW.item_type
      AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
    IF existing_notification_id IS NULL THEN
      notification_title := '您有一条转发';
      IF NEW.item_type = 'post' THEN
        notification_content_key := 'repost_to_you_post';
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 向您转发了帖子';
      ELSE
        notification_content_key := 'repost_to_you_product';
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 向您转发了商品';
      END IF;
      IF truncated_comment IS NOT NULL THEN notification_content := notification_content || '：' || truncated_comment; END IF;
      content_params := jsonb_build_object('actorName', COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户'));
      IF truncated_comment IS NOT NULL THEN content_params := content_params || jsonb_build_object('repostComment', truncated_comment); END IF;
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
      VALUES (NEW.target_user_id, 'repost', notification_title, notification_content, NEW.original_item_id::UUID, NEW.item_type, notification_link, NEW.user_id, notification_content_key, content_params);
    END IF;
  END IF;

  -- To original author
  IF original_post_user_id IS NOT NULL AND NEW.user_id != original_post_user_id AND (NEW.target_user_id IS NULL OR NEW.target_user_id != original_post_user_id) THEN
    SELECT id INTO existing_notification_id FROM notifications
    WHERE user_id = original_post_user_id AND type = 'repost' AND related_id = NEW.original_item_id AND related_type = NEW.item_type
      AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
    IF existing_notification_id IS NULL THEN
      notification_title := '您有一条转发';
      IF NEW.item_type = 'post' THEN
        notification_content_key := 'repost_of_yours_post';
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 转发了您的帖子';
      ELSE
        notification_content_key := 'repost_of_yours_product';
        notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 转发了您的商品';
      END IF;
      IF truncated_comment IS NOT NULL THEN notification_content := notification_content || '：' || truncated_comment; END IF;
      content_params := jsonb_build_object('actorName', COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户'));
      IF truncated_comment IS NOT NULL THEN content_params := content_params || jsonb_build_object('repostComment', truncated_comment); END IF;
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
      VALUES (original_post_user_id, 'repost', notification_title, notification_content, NEW.original_item_id::UUID, NEW.item_type, notification_link, NEW.user_id, notification_content_key, content_params);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Like (post) notification (051)
CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id UUID;
  liker_profile RECORD;
  existing_notification_id UUID;
BEGIN
  SELECT user_id INTO post_author_id FROM posts WHERE id = NEW.post_id;
  IF post_author_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT id INTO existing_notification_id FROM notifications
  WHERE user_id = post_author_id AND type = 'like' AND related_id = NEW.post_id AND related_type = 'post'
    AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
  IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT display_name, username INTO liker_profile FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
  VALUES (post_author_id, 'like', '您的帖子收到点赞',
    COALESCE(liker_profile.display_name, liker_profile.username, '某用户') || ' 点赞了您的帖子',
    NEW.post_id, 'post', '/post/' || NEW.post_id::text, NEW.user_id,
    'like_post', jsonb_build_object('actorName', COALESCE(liker_profile.display_name, liker_profile.username, '某用户')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Favorite notification (095): post, product (with preview), user
CREATE OR REPLACE FUNCTION create_favorite_notification()
RETURNS TRIGGER AS $$
DECLARE
  content_creator_id UUID;
  favoriter_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  notification_related_type TEXT;
  notification_content_key TEXT;
  content_params JSONB;
  existing_notification_id UUID;
  product_name TEXT;
BEGIN
  SELECT display_name, username INTO favoriter_profile FROM profiles WHERE id = NEW.user_id;

  IF NEW.item_type = 'post' THEN
    SELECT user_id INTO content_creator_id FROM posts WHERE id = NEW.item_id::UUID;
    IF content_creator_id IS NULL THEN RETURN NEW; END IF;
    IF content_creator_id = NEW.user_id THEN RETURN NEW; END IF;
    SELECT id INTO existing_notification_id FROM notifications
    WHERE user_id = content_creator_id AND type = 'favorite' AND related_id = NEW.item_id AND related_type = 'post'
      AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
    IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
    notification_title := '您的帖子被收藏';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 收藏了您的帖子';
    notification_link := '/post/' || NEW.item_id::TEXT;
    notification_related_type := 'post';
    notification_content_key := 'favorite_post';
    content_params := jsonb_build_object('actorName', COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户'));

  ELSIF NEW.item_type = 'product' THEN
    SELECT seller_id, name INTO content_creator_id, product_name FROM products WHERE id = NEW.item_id::UUID;
    IF content_creator_id IS NULL THEN RETURN NEW; END IF;
    IF content_creator_id = NEW.user_id THEN RETURN NEW; END IF;
    SELECT id INTO existing_notification_id FROM notifications
    WHERE user_id = content_creator_id AND type = 'favorite' AND related_id = NEW.item_id AND related_type = 'product'
      AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
    IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
    notification_title := '您的商品被收藏';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 收藏了您的商品《' || COALESCE(product_name, '未知商品') || '》';
    notification_link := '/product/' || NEW.item_id::TEXT;
    notification_related_type := 'product';
    notification_content_key := 'favorite_product';
    content_params := jsonb_build_object('actorName', COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户'), 'preview', COALESCE(product_name, '未知商品'));

  ELSIF NEW.item_type = 'user' THEN
    content_creator_id := NEW.item_id::UUID;
    IF content_creator_id = NEW.user_id THEN RETURN NEW; END IF;
    SELECT id INTO existing_notification_id FROM notifications
    WHERE user_id = content_creator_id AND type = 'favorite' AND related_id = NEW.item_id AND related_type = 'user'
      AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
    IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
    notification_title := '您被添加到特别关注';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 将您添加到了特别关注';
    notification_link := '/profile/' || NEW.item_id::TEXT;
    notification_related_type := 'user';
    notification_content_key := 'favorite_user';
    content_params := jsonb_build_object('actorName', COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户'));

  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
  VALUES (content_creator_id, 'favorite', notification_title, notification_content, NEW.item_id::UUID, notification_related_type, notification_link, NEW.user_id, notification_content_key, content_params);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Share notification (097)
CREATE OR REPLACE FUNCTION create_share_notification()
RETURNS TRIGGER AS $$
DECLARE
  content_creator_id UUID;
  sharer_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  notification_related_type TEXT;
  notification_content_key TEXT;
  content_params JSONB;
  existing_notification_id UUID;
  product_name TEXT;
BEGIN
  SELECT display_name, username INTO sharer_profile FROM profiles WHERE id = NEW.user_id;

  IF NEW.item_type = 'post' THEN
    SELECT user_id INTO content_creator_id FROM posts WHERE id = NEW.item_id::UUID;
    IF content_creator_id IS NULL THEN RETURN NEW; END IF;
    IF content_creator_id = NEW.user_id THEN RETURN NEW; END IF;
    SELECT id INTO existing_notification_id FROM notifications
    WHERE user_id = content_creator_id AND type = 'share' AND related_id = NEW.item_id AND related_type = 'post'
      AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
    IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
    notification_title := '您的帖子被分享';
    notification_content := COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户') || ' 分享了您的帖子';
    notification_link := '/post/' || NEW.item_id::TEXT;
    notification_related_type := 'post';
    notification_content_key := 'share_post';
    content_params := jsonb_build_object('actorName', COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户'));

  ELSIF NEW.item_type = 'product' THEN
    SELECT seller_id, name INTO content_creator_id, product_name FROM products WHERE id = NEW.item_id::UUID;
    IF content_creator_id IS NULL THEN RAISE WARNING 'create_share_notification: Product not found'; RETURN NEW; END IF;
    IF content_creator_id = NEW.user_id THEN RETURN NEW; END IF;
    SELECT id INTO existing_notification_id FROM notifications
    WHERE user_id = content_creator_id AND type = 'share' AND related_id = NEW.item_id AND related_type = 'product'
      AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
    IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
    notification_title := '您的商品被分享';
    notification_content := COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户') || ' 分享了您的商品《' || COALESCE(product_name, '未知商品') || '》';
    notification_link := '/product/' || NEW.item_id::TEXT;
    notification_related_type := 'product';
    notification_content_key := 'share_product';
    content_params := jsonb_build_object('actorName', COALESCE(sharer_profile.display_name, sharer_profile.username, '某用户'), 'preview', COALESCE(product_name, '未知商品'));

  ELSE
    RAISE WARNING 'create_share_notification: Unsupported item_type: %', NEW.item_type;
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
    VALUES (content_creator_id, 'share', notification_title, notification_content, NEW.item_id::UUID, notification_related_type, notification_link, NEW.user_id, notification_content_key, content_params);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_share_notification: Failed to insert notification: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Post creation notification (075)
CREATE OR REPLACE FUNCTION create_post_creation_notification()
RETURNS TRIGGER AS $$
DECLARE
  post_author_profile RECORD;
  admin_user RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  post_preview TEXT;
  content_params JSONB;
BEGIN
  IF NEW.status != 'pending' THEN RETURN NEW; END IF;
  SELECT display_name, username INTO post_author_profile FROM profiles WHERE id = NEW.user_id;
  IF NEW.content IS NOT NULL AND LENGTH(NEW.content) > 0 THEN
    post_preview := CASE WHEN LENGTH(NEW.content) > 50 THEN LEFT(NEW.content, 50) || '...' ELSE NEW.content END;
  ELSE
    post_preview := '[图片帖子]';
  END IF;
  notification_title := '收到新的待审核帖子';
  notification_content := COALESCE(post_author_profile.display_name, post_author_profile.username, '某用户') || ' 发布了新帖子：' || post_preview;
  notification_link := '/admin/review';
  content_params := jsonb_build_object('actorName', COALESCE(post_author_profile.display_name, post_author_profile.username, '某用户'), 'preview', post_preview);

  FOR admin_user IN SELECT id FROM profiles WHERE role IN ('admin', 'support')
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
      VALUES (admin_user.id, 'system', notification_title, notification_content, NEW.id::UUID, 'post', notification_link, NEW.user_id, 'new_post', content_params);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_post_creation_notification: Failed to insert: %', SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Product creation notification (121)
CREATE OR REPLACE FUNCTION create_product_creation_notification()
RETURNS TRIGGER AS $$
DECLARE
  product_seller_profile RECORD;
  admin_user RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  product_preview TEXT;
  content_params JSONB;
BEGIN
  IF NEW.status != 'pending' THEN RETURN NEW; END IF;
  SELECT display_name, username INTO product_seller_profile FROM profiles WHERE id = NEW.seller_id;
  IF NEW.name IS NOT NULL AND LENGTH(NEW.name) > 0 THEN
    product_preview := CASE WHEN LENGTH(NEW.name) > 50 THEN LEFT(NEW.name, 50) || '...' ELSE NEW.name END;
  ELSE
    product_preview := '[未命名商品]';
  END IF;
  notification_title := '收到新的待审核商品';
  notification_content := COALESCE(product_seller_profile.display_name, product_seller_profile.username, '某卖家') || ' 发布了新商品：' || product_preview;
  notification_link := '/admin/review';
  content_params := jsonb_build_object('actorName', COALESCE(product_seller_profile.display_name, product_seller_profile.username, '某卖家'), 'preview', product_preview);

  FOR admin_user IN SELECT id FROM profiles WHERE role IN ('admin', 'support')
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
      VALUES (admin_user.id, 'system', notification_title, notification_content, NEW.id::UUID, 'product', notification_link, NEW.seller_id, 'new_product', content_params);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_product_creation_notification: Failed to insert: %', SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Product review notification (123)
CREATE OR REPLACE FUNCTION create_product_review_notification()
RETURNS TRIGGER AS $$
DECLARE
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  product_preview TEXT;
  content_params JSONB;
BEGIN
  IF NEW.name IS NOT NULL AND LENGTH(NEW.name) > 0 THEN
    product_preview := CASE WHEN LENGTH(NEW.name) > 50 THEN LEFT(NEW.name, 50) || '...' ELSE NEW.name END;
  ELSE
    product_preview := '[未命名商品]';
  END IF;

  IF NEW.status = 'active' THEN
    notification_title := '您的商品已通过审核';
    notification_content := '您的商品「' || product_preview || '」已通过审核，现已上架可售';
    content_params := jsonb_build_object('preview', product_preview);
    notification_link := '/product/' || NEW.id::TEXT;
    BEGIN
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
      VALUES (NEW.seller_id, 'system', notification_title, notification_content, NEW.id::UUID, 'product', notification_link, NEW.reviewed_by, 'product_approved', content_params);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_product_review_notification: Failed for product_id: %', NEW.id;
    END;
  ELSE
    notification_title := '您的商品未通过审核';
    notification_content := '很抱歉，您的商品「' || product_preview || '」未通过审核';
    content_params := jsonb_build_object('preview', product_preview);
    notification_link := '/product/' || NEW.id::TEXT;
    BEGIN
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
      VALUES (NEW.seller_id, 'system', notification_title, notification_content, NEW.id::UUID, 'product', notification_link, NEW.reviewed_by, 'product_rejected', content_params);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_product_review_notification: Failed for product_id: %', NEW.id;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Product want notification (091)
CREATE OR REPLACE FUNCTION create_product_want_notification()
RETURNS TRIGGER AS $$
DECLARE
  product_seller_id UUID;
  wanter_profile RECORD;
  existing_notification_id UUID;
  product_name TEXT;
BEGIN
  SELECT seller_id, name INTO product_seller_id, product_name FROM products WHERE id = NEW.product_id;
  IF product_seller_id IS NULL THEN RETURN NEW; END IF;
  IF product_seller_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT id INTO existing_notification_id FROM notifications
  WHERE user_id = product_seller_id AND type = 'want' AND related_id = NEW.product_id AND related_type = 'product'
    AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
  IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT display_name, username INTO wanter_profile FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
  VALUES (product_seller_id, 'want', '您的商品被标记为"想要"',
    COALESCE(wanter_profile.display_name, wanter_profile.username, '某用户') || ' 标记了您的商品《' || COALESCE(product_name, '未知商品') || '》为"想要"',
    NEW.product_id, 'product', '/product/' || NEW.product_id::text, NEW.user_id,
    'want_product', jsonb_build_object('actorName', COALESCE(wanter_profile.display_name, wanter_profile.username, '某用户')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Comment like notification (043)
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
  SELECT user_id, post_id, parent_id INTO comment_author_id, comment_post_id, comment_parent_id FROM public.comments WHERE id = NEW.comment_id;
  IF comment_author_id IS NULL OR comment_post_id IS NULL THEN RETURN NEW; END IF;
  IF comment_author_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT display_name, username INTO liker_profile FROM public.profiles WHERE id = NEW.user_id;
  notification_title := CASE WHEN comment_parent_id IS NULL THEN '您的评论收到点赞' ELSE '您的回复收到点赞' END;
  notification_content := COALESCE(liker_profile.display_name, liker_profile.username, '某用户') || ' 点赞了您的评论';
  notification_link := '/post/' || comment_post_id::text || '#comment-' || NEW.comment_id::text;
  INSERT INTO public.notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
  VALUES (comment_author_id, 'like', notification_title, notification_content, comment_post_id, 'comment', notification_link, NEW.user_id,
    'like_comment', jsonb_build_object('actorName', COALESCE(liker_profile.display_name, liker_profile.username, '某用户')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Product like notification (087)
CREATE OR REPLACE FUNCTION create_product_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  product_seller_id UUID;
  liker_profile RECORD;
  existing_notification_id UUID;
BEGIN
  SELECT seller_id INTO product_seller_id FROM products WHERE id = NEW.product_id;
  IF product_seller_id IS NULL THEN RETURN NEW; END IF;
  IF product_seller_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT id INTO existing_notification_id FROM notifications
  WHERE user_id = product_seller_id AND type = 'like' AND related_id = NEW.product_id AND related_type = 'product'
    AND actor_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 seconds' LIMIT 1;
  IF existing_notification_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT display_name, username INTO liker_profile FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
  VALUES (product_seller_id, 'like', '您的商品收到点赞',
    COALESCE(liker_profile.display_name, liker_profile.username, '某用户') || ' 点赞了您的商品',
    NEW.product_id, 'product', '/product/' || NEW.product_id::text, NEW.user_id,
    'like_product', jsonb_build_object('actorName', COALESCE(liker_profile.display_name, liker_profile.username, '某用户')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. Favorite user (follows is_favorite) notification (035)
CREATE OR REPLACE FUNCTION create_favorite_user_notification()
RETURNS TRIGGER AS $$
DECLARE
  favoriter_profile RECORD;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  content_params JSONB;
BEGIN
  IF NEW.is_favorite = true AND (OLD.is_favorite IS NULL OR OLD.is_favorite = false) THEN
    IF NEW.follower_id = NEW.followee_id THEN RETURN NEW; END IF;
    SELECT display_name, username INTO favoriter_profile FROM profiles WHERE id = NEW.follower_id;
    notification_title := '您被添加到特别关注';
    notification_content := COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户') || ' 将您添加到了特别关注';
    notification_link := '/profile/' || NEW.follower_id::TEXT;
    content_params := jsonb_build_object('actorName', COALESCE(favoriter_profile.display_name, favoriter_profile.username, '某用户'));
    INSERT INTO notifications (user_id, type, title, content, related_id, related_type, link, actor_id, content_key, content_params)
    VALUES (NEW.followee_id, 'favorite', notification_title, notification_content, NEW.follower_id, 'user', notification_link, NEW.follower_id, 'favorite_user', content_params);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
