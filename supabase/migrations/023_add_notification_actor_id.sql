-- 添加 actor_id 字段到 notifications 表
-- actor_id 存储触发通知的用户 ID（如点赞者、评论者、关注者等）

ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 添加注释
COMMENT ON COLUMN public.notifications.actor_id IS '触发通知的用户 ID（如点赞者、评论者、关注者等），系统通知为 NULL';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id ON public.notifications(actor_id);
