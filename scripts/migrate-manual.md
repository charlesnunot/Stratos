# 数据库迁移指南

## 方式一：通过 Supabase 控制台执行（推荐）

1. 访问 Supabase 控制台：
   - 打开 https://supabase.com/dashboard
   - 登录您的账户
   - 选择项目：`ihvjfkxkoxxnnnebrvlc`

2. 进入 SQL Editor：
   - 在左侧菜单选择 "SQL Editor"
   - 点击 "New query"

3. 执行迁移：
   - 打开文件 `supabase/migrations/001_initial_schema.sql`
   - 复制全部内容
   - 粘贴到 SQL Editor
   - 点击 "Run" 执行

4. 验证迁移：
   - 在左侧菜单选择 "Table Editor"
   - 检查是否已创建所有表：
     - profiles
     - subscriptions
     - payment_accounts
     - topics
     - posts
     - post_topics
     - products
     - affiliate_products
     - orders
     - logistics_tracking
     - conversations
     - messages
     - notifications
     - follows
     - likes
     - comments
     - tips
     - reports
     - support_tickets

## 方式二：使用 Supabase CLI

如果您已安装 Supabase CLI：

```bash
# 安装 Supabase CLI（如果未安装）
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref ihvjfkxkoxxnnnebrvlc

# 执行迁移
supabase db push
```

## 方式三：使用 Node.js 脚本

```bash
# 安装依赖
npm install

# 运行迁移脚本
node scripts/migrate.js
```

## 环境变量配置

创建 `.env.local` 文件（如果还没有）：

```env
NEXT_PUBLIC_SUPABASE_URL=https://ihvjfkxkoxxnnnebrvlc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlodmpma3hrb3h4bm5uZWJydmxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MDYxNzUsImV4cCI6MjA4Mjk4MjE3NX0.76BoLOiDPIazaU8yMYGvVLFxHJrgwHI236y3mP5whYU
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlodmpma3hrb3h4bm5uZWJydmxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQwNjE3NSwiZXhwIjoyMDgyOTgyMTc1fQ.Zlk93V556RokeQPQrPQQ7RhCltncw_poM0-4qy0SBZI
```

## 迁移后检查清单

- [ ] 所有表已创建
- [ ] RLS (Row Level Security) 已启用
- [ ] 索引已创建
- [ ] 触发器已创建
- [ ] 外键约束已设置
- [ ] 测试连接是否正常

## 常见问题

### 如果遇到权限错误
- 确保使用 service_role key 执行迁移
- 或者在 Supabase 控制台使用 SQL Editor（自动使用管理员权限）

### 如果表已存在
- 迁移脚本会跳过已存在的表
- 如果需要重新创建，先删除现有表

### 如果外键约束失败
- 确保 auth.users 表存在（Supabase 自动创建）
- 检查引用的表是否已创建
