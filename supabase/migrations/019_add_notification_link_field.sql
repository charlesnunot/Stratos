-- 添加 link 字段到 notifications 表
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS link TEXT;

-- 添加注释
COMMENT ON COLUMN public.notifications.link IS '通知的跳转链接，如果为空则根据 type 和 related_type 生成';
