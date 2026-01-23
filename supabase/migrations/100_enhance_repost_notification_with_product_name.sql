-- 增强转发通知触发器，在商品转发通知中添加商品名称
-- 让卖家能够从通知内容直接识别是哪个商品被转发
-- 包含去重功能（基于099的改进）

-- 创建转发通知触发器函数（带去重功能和商品名称）
CREATE OR REPLACE FUNCTION create_repost_notification()
RETURNS TRIGGER AS $$
DECLARE
  reposter_profile RECORD;
  original_post_user_id UUID;
  notification_title TEXT;
  notification_content TEXT;
  notification_link TEXT;
  repost_comment TEXT;
  truncated_comment TEXT;
  existing_notification_id UUID;
  product_name TEXT;
BEGIN
  -- 只在插入时发送通知
  IF TG_OP = 'INSERT' THEN
    -- 获取原项目作者ID和商品名称（如果是商品）
    IF NEW.item_type = 'post' THEN
      SELECT user_id INTO original_post_user_id FROM posts WHERE id = NEW.original_item_id::UUID;
    ELSIF NEW.item_type = 'product' THEN
      SELECT seller_id, name INTO original_post_user_id, product_name FROM products WHERE id = NEW.original_item_id::UUID;
    END IF;
    
    -- 获取转发者信息
    SELECT display_name, username INTO reposter_profile
    FROM profiles
    WHERE id = NEW.user_id;
    
    -- 处理转发评论（如果有），限制长度为100字符
    IF NEW.repost_content IS NOT NULL AND LENGTH(TRIM(NEW.repost_content)) > 0 THEN
      repost_comment := TRIM(NEW.repost_content);
      IF LENGTH(repost_comment) > 100 THEN
        truncated_comment := LEFT(repost_comment, 100) || '...';
      ELSE
        truncated_comment := repost_comment;
      END IF;
    ELSE
      truncated_comment := NULL;
    END IF;
    
    -- 构建通知链接
    IF NEW.item_type = 'post' THEN
      notification_link := '/post/' || NEW.original_item_id::TEXT;
    ELSIF NEW.item_type = 'product' THEN
      notification_link := '/product/' || NEW.original_item_id::TEXT;
    END IF;
    
    -- 1. 给目标用户发送通知（转发给目标用户）
    IF NEW.target_user_id IS NOT NULL AND NEW.user_id != NEW.target_user_id THEN
      -- 检查最近5秒内是否已有相同通知（去重）
      SELECT id INTO existing_notification_id
      FROM notifications
      WHERE user_id = NEW.target_user_id
        AND type = 'repost'
        AND related_id = NEW.original_item_id
        AND related_type = NEW.item_type
        AND actor_id = NEW.user_id
        AND created_at > NOW() - INTERVAL '5 seconds'
      LIMIT 1;

      -- 如果最近已有通知，跳过创建新通知
      IF existing_notification_id IS NULL THEN
        notification_title := '您有一条转发';
        IF NEW.item_type = 'post' THEN
          notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 向您转发了帖子';
        ELSE
          -- 商品转发通知，包含商品名称
          notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 向您转发了商品《' || COALESCE(product_name, '未知商品') || '》';
        END IF;
        
        -- 如果有转发评论，追加到通知内容中
        IF truncated_comment IS NOT NULL THEN
          notification_content := notification_content || '：' || truncated_comment;
        END IF;
        
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
          NEW.target_user_id,
          'repost',
          notification_title,
          notification_content,
          NEW.original_item_id::UUID,
          NEW.item_type,
          notification_link,
          NEW.user_id
        );
      END IF;
    END IF;
    
    -- 2. 给原项目作者发送通知（有人转发了他的内容）
    IF original_post_user_id IS NOT NULL 
       AND NEW.user_id != original_post_user_id 
       AND (NEW.target_user_id IS NULL OR NEW.target_user_id != original_post_user_id) THEN
      -- 检查最近5秒内是否已有相同通知（去重）
      SELECT id INTO existing_notification_id
      FROM notifications
      WHERE user_id = original_post_user_id
        AND type = 'repost'
        AND related_id = NEW.original_item_id
        AND related_type = NEW.item_type
        AND actor_id = NEW.user_id
        AND created_at > NOW() - INTERVAL '5 seconds'
      LIMIT 1;

      -- 如果最近已有通知，跳过创建新通知
      IF existing_notification_id IS NULL THEN
        notification_title := '您有一条转发';
        IF NEW.item_type = 'post' THEN
          notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 转发了您的帖子';
        ELSE
          -- 商品转发通知，包含商品名称
          notification_content := COALESCE(reposter_profile.display_name, reposter_profile.username, '某用户') || ' 转发了您的商品《' || COALESCE(product_name, '未知商品') || '》';
        END IF;
        
        -- 如果有转发评论，追加到通知内容中
        IF truncated_comment IS NOT NULL THEN
          notification_content := notification_content || '：' || truncated_comment;
        END IF;
        
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
          original_post_user_id,
          'repost',
          notification_title,
          notification_content,
          NEW.original_item_id::UUID,
          NEW.item_type,
          notification_link,
          NEW.user_id
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 触发器已存在于 038_add_repost_support.sql
-- 函数替换会自动更新行为，无需重新创建触发器

-- 验证函数具有 SECURITY DEFINER
DO $$
DECLARE
  has_security_definer BOOLEAN;
BEGIN
  SELECT prosecdef INTO has_security_definer
  FROM pg_proc
  WHERE proname = 'create_repost_notification';
  
  IF NOT has_security_definer THEN
    RAISE EXCEPTION 'Function create_repost_notification does not have SECURITY DEFINER';
  END IF;
  
  RAISE NOTICE 'Function create_repost_notification verified: SECURITY DEFINER = %, deduplication and product name enabled', has_security_definer;
END $$;
