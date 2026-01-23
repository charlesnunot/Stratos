-- 更新 handle_new_user() 函数，添加创建欢迎通知的逻辑
-- 在用户注册后自动创建欢迎通知，引导用户完善个人资料
-- 
-- 重要：此迁移依赖于迁移 019_add_notification_link_field.sql
-- 请确保先执行 019 添加 link 列，再执行此迁移更新函数

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 创建 profile
  INSERT INTO public.profiles (
    id,
    username,
    display_name
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'username', 'User')
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- 创建欢迎通知
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    content,
    related_id,
    related_type,
    link
  )
  VALUES (
    NEW.id,
    'system',
    '欢迎加入 Stratos！',
    '开始完善您的个人资料，让更多人认识您。',
    NEW.id,
    'user',
    '/profile/' || NEW.id::text || '/edit'
  );
  
  RETURN NEW;
END;
$$;

-- 触发器已在 003_create_profile_trigger.sql 中创建，无需重新创建
