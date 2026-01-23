-- Storage RLS 策略配置
-- 注意：这些策略需要在 Supabase 控制台的 Storage 部分手动配置
-- 或者使用 Supabase CLI 执行

-- 为 posts bucket 创建存储策略
-- 注意：Storage policies 需要通过 Supabase Dashboard 或 Storage API 配置
-- 以下是 SQL 格式的策略说明，实际需要在 Storage 管理界面配置

-- 策略 1: 允许认证用户上传到自己的文件夹
-- Policy Name: "Users can upload to own folder"
-- Bucket: posts
-- Operation: INSERT
-- Policy Definition:
-- (bucket_id = 'posts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)

-- 策略 2: 允许所有人查看已上传的文件
-- Policy Name: "Anyone can view posts"
-- Bucket: posts
-- Operation: SELECT
-- Policy Definition:
-- (bucket_id = 'posts'::text)

-- 策略 3: 允许用户删除自己上传的文件
-- Policy Name: "Users can delete own files"
-- Bucket: posts
-- Operation: DELETE
-- Policy Definition:
-- (bucket_id = 'posts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)

-- 策略 4: 允许用户更新自己上传的文件
-- Policy Name: "Users can update own files"
-- Bucket: posts
-- Operation: UPDATE
-- Policy Definition:
-- (bucket_id = 'posts'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)

-- 注意：由于 Storage RLS 策略不能通过 SQL 直接创建，需要在 Supabase Dashboard 中配置：
-- 1. 进入 Supabase Dashboard
-- 2. 选择 Storage
-- 3. 选择 posts bucket
-- 4. 点击 "Policies" 标签
-- 5. 点击 "New Policy"
-- 6. 按照上面的策略定义创建策略

-- 或者使用以下 SQL 通过 Supabase 的存储策略表创建（如果支持）：
-- 注意：这需要 Supabase 的特定扩展，通常通过 Dashboard 配置更可靠

-- 创建存储策略的替代方法（如果 Supabase 支持）：
-- 这些命令需要在 Supabase Dashboard 的 Storage 部分执行，而不是 SQL Editor
