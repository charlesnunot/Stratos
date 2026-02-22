-- Allow admin/support to update comments (e.g. approve/reject for content review)
-- SELECT for pending comments is already allowed by "Users can view ... OR ... role IN ('admin', 'support')"

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Admin and support can update comments') THEN
    CREATE POLICY "Admin and support can update comments"
    ON comments
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'support')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'support')
      )
    );
  END IF;
END $$;

COMMENT ON POLICY "Admin and support can update comments" ON comments
IS '允许管理员/客服更新评论状态（审核通过/拒绝）';
