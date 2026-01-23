-- 更新 notifications 表的 type 和 related_type 字段约束
-- 添加 'report' 类型以支持举报相关的通知

-- 更新 type 字段约束，添加 'report' 类型
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('like', 'comment', 'follow', 'order', 'commission', 'system', 'report'));

-- 更新 related_type 字段约束，添加 'report' 类型
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_related_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_related_type_check 
  CHECK (related_type IN ('post', 'order', 'user', 'product', 'report', 'comment', 'affiliate_post', 'tip', 'message') OR related_type IS NULL);
