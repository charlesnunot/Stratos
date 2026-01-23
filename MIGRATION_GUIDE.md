# 数据库迁移指南

## 快速开始

### 步骤 1: 配置环境变量

环境变量文件 `.env.local` 已创建，包含以下配置：

```
NEXT_PUBLIC_SUPABASE_URL=https://ihvjfkxkoxxnnnebrvlc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 步骤 2: 执行数据库迁移

#### 方式一：通过 Supabase 控制台（推荐）

1. **访问 Supabase 控制台**
   - 打开 https://supabase.com/dashboard
   - 登录您的账户
   - 选择项目（项目ID: `ihvjfkxkoxxnnnebrvlc`）

2. **进入 SQL Editor**
   - 在左侧菜单点击 "SQL Editor"
   - 点击 "New query" 创建新查询

3. **执行迁移 SQL**
   - 打开文件：`supabase/migrations/001_initial_schema.sql`
   - 复制全部内容（约 442 行）
   - 粘贴到 SQL Editor
   - 点击 "Run" 或按 `Ctrl+Enter` 执行

4. **验证迁移**
   - 在左侧菜单点击 "Table Editor"
   - 检查是否已创建以下表：
     - ✅ profiles
     - ✅ subscriptions
     - ✅ payment_accounts
     - ✅ topics
     - ✅ posts
     - ✅ post_topics
     - ✅ products
     - ✅ affiliate_products
     - ✅ orders
     - ✅ logistics_tracking
     - ✅ conversations
     - ✅ messages
     - ✅ notifications
     - ✅ follows
     - ✅ likes
     - ✅ comments
     - ✅ tips
     - ✅ reports
     - ✅ support_tickets

#### 方式二：使用验证脚本

运行验证脚本检查迁移状态：

```bash
node scripts/verify-migration.js
```

## 迁移内容

本次迁移将创建：

- **19 个数据表**：涵盖用户、帖子、商品、订单、聊天、通知等所有核心功能
- **Row Level Security (RLS)**：所有表都启用了行级安全策略
- **索引**：为常用查询字段创建了索引以提升性能
- **触发器**：自动更新 `updated_at` 时间戳
- **外键约束**：确保数据完整性

## 迁移后检查

### 1. 检查表结构

在 Supabase 控制台的 Table Editor 中，确认所有表都已创建。

### 2. 检查 RLS 策略

在 Supabase 控制台的 Authentication > Policies 中，确认所有表都有相应的 RLS 策略。

### 3. 测试连接

运行以下命令测试数据库连接：

```bash
npm run dev
```

访问 http://localhost:3000，尝试注册/登录功能。

## 常见问题

### Q: 迁移时出现 "relation already exists" 错误

**A:** 某些表可能已存在。可以：
- 删除现有表后重新执行
- 或者修改 SQL，在 CREATE TABLE 前添加 `DROP TABLE IF EXISTS`

### Q: 外键约束失败

**A:** 确保：
- `auth.users` 表存在（Supabase 自动创建）
- 按照正确的顺序执行 SQL（先创建被引用的表）

### Q: RLS 策略不生效

**A:** 检查：
- RLS 是否已启用：`ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
- 策略是否正确创建
- 用户是否有正确的权限

### Q: 如何回滚迁移

**A:** 如果需要回滚，可以：
1. 在 Supabase 控制台删除所有表
2. 或者创建回滚 SQL 脚本

## 下一步

迁移完成后，您可以：

1. **启动开发服务器**
   ```bash
   npm install
   npm run dev
   ```

2. **测试功能**
   - 注册新用户
   - 创建帖子
   - 发布商品
   - 发送消息

3. **配置其他服务**
   - 支付集成（Stripe、PayPal等）
   - 物流API
   - 邮件服务

## 需要帮助？

如果遇到问题，请：
1. 查看 Supabase 控制台的错误日志
2. 检查 SQL Editor 的执行结果
3. 运行验证脚本：`node scripts/verify-migration.js`
