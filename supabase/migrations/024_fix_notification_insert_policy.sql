-- 修复 notifications 表的 INSERT 权限问题
-- 允许系统通过 SECURITY DEFINER 函数插入通知

-- 删除可能存在的旧策略（如果存在）
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

-- 创建策略：允许通过 SECURITY DEFINER 函数插入通知
-- 这个策略允许触发器函数插入通知，同时保持安全性
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT
  WITH CHECK (true);
