-- 更新 notifications 表的 type 字段约束
-- 添加 'share' 类型以支持分享相关的通知

-- 更新 type 字段约束，添加 'share' 类型
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('like', 'comment', 'follow', 'order', 'commission', 'system', 'report', 'favorite', 'repost', 'share'));
