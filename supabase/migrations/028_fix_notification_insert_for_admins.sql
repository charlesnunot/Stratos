-- 修复 notifications 表的 INSERT RLS 策略
-- 允许管理员和 support 角色为其他用户插入通知

-- 允许管理员和 support 角色插入通知
CREATE POLICY "Admins can insert notifications" ON notifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'support')
    )
  );
