# Vercel 部署指南

本指南将帮助您将 Stratos 项目部署到 Vercel。

## 前置条件

1. ✅ 项目已推送到 GitHub 仓库
2. ✅ 拥有 Vercel 账号（如果没有，请访问 https://vercel.com 注册）
3. ✅ 准备好所有环境变量

## 部署方法

### 方法 1: 通过 Vercel 网站部署（推荐）

1. **访问 Vercel 并登录**
   - 打开 https://vercel.com
   - 使用 GitHub 账号登录（推荐）

2. **导入项目**
   - 点击 "Add New Project" 或 "Import Project"
   - 选择 GitHub 仓库：`charlesnunot/Stratos`
   - 点击 "Import"

3. **配置项目设置**
   - **Framework Preset**: Next.js（应该自动检测）
   - **Root Directory**: `./`（默认）
   - **Build Command**: `npm run build`（默认）
   - **Output Directory**: `.next`（默认）
   - **Install Command**: `npm install`（默认）

4. **配置环境变量**
   在 "Environment Variables" 部分添加以下变量：

   **必需变量：**
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   CRON_SECRET=your_cron_secret_key
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```

   **支付相关（根据使用的支付方式添加）：**
   ```
   # Stripe
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   
   # PayPal
   PAYPAL_CLIENT_ID=your_paypal_client_id
   PAYPAL_CLIENT_SECRET=your_paypal_client_secret
   
   # Alipay
   ALIPAY_APP_ID=your_alipay_app_id
   ALIPAY_PRIVATE_KEY=your_alipay_private_key
   ALIPAY_PUBLIC_KEY=your_alipay_public_key
   
   # WeChat Pay
   WECHAT_PAY_APP_ID=your_wechat_pay_app_id
   WECHAT_PAY_MCH_ID=your_wechat_pay_mch_id
   WECHAT_PAY_API_KEY=your_wechat_pay_api_key
   ```

   **其他：**
   ```
   NODE_ENV=production
   ```

5. **部署**
   - 点击 "Deploy" 按钮
   - 等待构建完成（通常需要 2-5 分钟）

6. **完成**
   - 部署成功后，您会获得一个 URL（例如：`https://stratos-xxx.vercel.app`）
   - 更新 `NEXT_PUBLIC_APP_URL` 环境变量为实际的生产 URL

### 方法 2: 通过 Vercel CLI 部署

1. **安装 Vercel CLI**
   ```powershell
   npm i -g vercel
   ```

2. **登录 Vercel**
   ```powershell
   vercel login
   ```

3. **部署项目**
   ```powershell
   cd C:\Stratos
   vercel
   ```
   
   按照提示：
   - 选择项目范围
   - 确认项目设置
   - 链接到现有项目或创建新项目

4. **配置环境变量**
   ```powershell
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   # ... 添加其他环境变量
   ```

5. **生产环境部署**
   ```powershell
   vercel --prod
   ```

## 配置定时任务（Cron Jobs）

项目已配置了多个定时任务（在 `vercel.json` 中）。Vercel 会自动识别并配置这些任务。

确保在 Vercel 项目设置中：
1. 启用 "Cron Jobs"
2. 设置 `CRON_SECRET` 环境变量（用于保护 cron 端点）

## 环境变量说明

### 必需变量

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 项目 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 匿名密钥
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase 服务角色密钥（用于服务器端操作）
- `CRON_SECRET`: 用于保护 cron 端点的密钥
- `NEXT_PUBLIC_APP_URL`: 生产环境的完整 URL

### 可选变量

根据您使用的支付方式添加相应的环境变量。参考 `.env.example` 文件获取完整列表。

## 部署后检查清单

- [ ] 网站可以正常访问
- [ ] 所有页面路由正常工作
- [ ] 数据库连接正常（Supabase）
- [ ] 支付功能正常（如果已配置）
- [ ] 定时任务正常运行
- [ ] 环境变量都已正确配置
- [ ] 生产环境 URL 已更新到 `NEXT_PUBLIC_APP_URL`

## 常见问题

### 构建失败

1. **检查 Node.js 版本**
   - Vercel 默认使用 Node.js 18.x
   - 如果需要特定版本，在 `package.json` 中添加：
     ```json
     "engines": {
       "node": "20.x"
     }
     ```

2. **检查依赖**
   - 确保所有依赖都在 `package.json` 中
   - 运行 `npm install` 确保本地可以正常构建

3. **检查环境变量**
   - 确保所有必需的环境变量都已配置
   - 检查变量名是否正确（区分大小写）

### 运行时错误

1. **检查日志**
   - 在 Vercel 仪表板中查看 "Functions" 日志
   - 检查是否有 API 路由错误

2. **检查 Supabase 连接**
   - 确认 Supabase URL 和密钥正确
   - 检查 Supabase 项目的网络设置

### 定时任务不运行

1. **检查 CRON_SECRET**
   - 确保已设置 `CRON_SECRET` 环境变量
   - 在 cron 端点中验证密钥

2. **检查 Vercel Cron 配置**
   - 在 Vercel 项目设置中确认 Cron Jobs 已启用
   - 检查 `vercel.json` 中的 cron 配置

## 更新部署

每次推送到 GitHub 的 `main` 分支时，Vercel 会自动触发新的部署。

如果需要手动触发部署：
1. 在 Vercel 仪表板中点击 "Redeploy"
2. 或使用 CLI: `vercel --prod`

## 自定义域名

1. 在 Vercel 项目设置中点击 "Domains"
2. 添加您的自定义域名
3. 按照提示配置 DNS 记录

## 支持

如果遇到问题：
- 查看 Vercel 文档：https://vercel.com/docs
- 查看项目日志：Vercel 仪表板 > 项目 > Deployments > 选择部署 > Logs
- 检查 GitHub Issues
