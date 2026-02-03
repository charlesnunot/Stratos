-- Allow admin/support to update comments (e.g. approve/reject for content review)
-- SELECT for pending comments is already allowed by "Users can view ... OR ... role IN ('admin', 'support')"

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

COMMENT ON POLICY "Admin and support can update comments" ON comments
IS '允许管理员/客服更新评论状态（审核通过/拒绝）';
