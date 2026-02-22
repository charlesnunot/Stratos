-- Restrict notifications INSERT: remove permissive CHECK (true), allow only own user_id or admin/support.
-- Triggers that insert notifications for other users must use SECURITY DEFINER or service role (bypass RLS).

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can insert own notifications') THEN
    CREATE POLICY "Users can insert own notifications" ON notifications
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON POLICY "Users can insert own notifications" ON notifications IS
  'Users may only insert notifications for themselves (user_id = auth.uid()). Admins/support can insert for any user via "Admins can insert notifications". Triggers inserting for others must use SECURITY DEFINER or service role.';
