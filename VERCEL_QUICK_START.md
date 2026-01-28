# Vercel 快速部署指南

## ✅ 代码已推送到 GitHub

您的代码已成功推送到：https://github.com/charlesnunot/Stratos

## 🚀 在 Vercel 上部署（5 分钟）

### 步骤 1: 访问 Vercel

1. 打开 https://vercel.com
2. 点击 "Sign Up" 或 "Log In"
3. 选择 "Continue with GitHub"（推荐，自动连接仓库）

### 步骤 2: 导入项目

1. 登录后，点击 **"Add New Project"** 或 **"Import Project"**
2. 在仓库列表中找到并选择：**`charlesnunot/Stratos`**
3. 点击 **"Import"**

### 步骤 3: 配置项目

Vercel 会自动检测 Next.js 项目，保持以下默认设置：

- **Framework Preset**: Next.js ✅
- **Root Directory**: `./` ✅
- **Build Command**: `npm run build` ✅
- **Output Directory**: `.next` ✅
- **Install Command**: `npm install` ✅

**无需修改，直接继续！**

### 步骤 4: 配置环境变量

在 "Environment Variables" 部分，点击 "Add" 添加以下变量：

#### 必需变量（必须添加）

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色密钥 | `eyJhbGc...` |
| `CRON_SECRET` | 定时任务密钥（随机字符串） | `your-random-secret-key` |
| `NEXT_PUBLIC_APP_URL` | 应用 URL（部署后更新） | `https://stratos-xxx.vercel.app` |
| `NODE_ENV` | 环境类型 | `production` |

#### 支付相关变量（根据使用的支付方式添加）

**Stripe（如果使用）：**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

**PayPal（如果使用）：**
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`

**Alipay（如果使用）：**
- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`

**WeChat Pay（如果使用）：**
- `WECHAT_PAY_APP_ID`
- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_API_KEY`

### 步骤 5: 部署

1. 点击 **"Deploy"** 按钮
2. 等待构建完成（通常 2-5 分钟）
3. 构建成功后，您会看到部署 URL（例如：`https://stratos-xxx.vercel.app`）

### 步骤 6: 更新应用 URL

1. 复制部署后的 URL（例如：`https://stratos-xxx.vercel.app`）
2. 在 Vercel 项目设置中，更新 `NEXT_PUBLIC_APP_URL` 环境变量
3. 点击 "Redeploy" 重新部署以应用更改

## 📋 环境变量检查清单

在部署前，确保已配置：

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `CRON_SECRET`（随机生成，例如：`openssl rand -hex 32`）
- [ ] `NEXT_PUBLIC_APP_URL`（部署后更新）
- [ ] `NODE_ENV=production`
- [ ] 支付相关变量（如果使用）

## 🔧 生成 CRON_SECRET

在 PowerShell 中运行：

```powershell
# 生成随机密钥
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

或使用在线工具生成随机字符串。

## ✅ 部署后检查

部署成功后，检查以下内容：

- [ ] 网站可以正常访问
- [ ] 首页加载正常
- [ ] 登录功能正常
- [ ] 数据库连接正常（Supabase）
- [ ] API 路由正常工作
- [ ] 定时任务已配置（在 Vercel 项目设置中启用 Cron Jobs）

## 🎯 下一步

1. ✅ 代码已推送到 GitHub
2. ⏳ 在 Vercel 上创建项目
3. ⏳ 配置环境变量
4. ⏳ 完成首次部署
5. ⏳ 测试应用功能
6. ⏳ 配置自定义域名（可选）

## 📚 详细文档

- **完整部署指南**: 查看 `VERCEL_DEPLOYMENT_GUIDE.md`
- **部署状态**: 查看 `DEPLOYMENT_STATUS.md`
- **故障排除**: 查看 `VERCEL_DEPLOYMENT_GUIDE.md` 中的"常见问题"部分

## 🆘 需要帮助？

如果遇到问题：

1. **构建失败**
   - 查看 Vercel 部署日志
   - 检查环境变量是否正确
   - 确认 Node.js 版本兼容

2. **运行时错误**
   - 查看 Vercel 函数日志
   - 检查 Supabase 连接
   - 验证环境变量值

3. **定时任务不运行**
   - 确认在 Vercel 中启用了 Cron Jobs
   - 检查 `CRON_SECRET` 是否已配置
   - 查看 `vercel.json` 中的 cron 配置

## 🔗 有用的链接

- Vercel 仪表板：https://vercel.com/dashboard
- Vercel 文档：https://vercel.com/docs
- Next.js 文档：https://nextjs.org/docs
- Supabase 文档：https://supabase.com/docs
