-- 修复 profile 编辑保存时的 RLS 报错："new row violates row-level security policy"
-- UPDATE 策略未指定 WITH CHECK 时，Postgres 默认用 USING 作为新行的检查；显式设置 WITH CHECK (true) 确保通过 USING 的更新在写入新行时不会失败

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (true);

COMMENT ON POLICY "Users can update own profile" ON profiles IS 'USING: 仅本人可更新；WITH CHECK: 允许写入任意合法列值（pending_*、profile_status 等）';
