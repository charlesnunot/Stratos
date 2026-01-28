# Vercel 设置步骤（解决 GitHub 授权问题）

## 🔧 步骤 1: 安装 GitHub 应用程序

当您看到 "Install the GitHub application for the accounts you wish to Import from to continue" 时：

1. **点击 "Install the GitHub application"** 或类似的按钮/链接
2. 您将被重定向到 GitHub 授权页面
3. **选择要授权的账户**：
   - 如果您的 GitHub 用户名是 `charlesnunot`，选择该账户
   - 可以选择授权所有仓库或仅特定仓库（推荐选择 "All repositories" 或 "Only select repositories"）
4. **点击 "Install"** 或 "Authorize" 完成授权

## 🚀 步骤 2: 返回 Vercel 并导入项目

授权完成后：

1. **返回 Vercel 页面**（通常会自动跳转）
2. **刷新页面**（如果还没有自动跳转）
3. 现在您应该能看到您的 GitHub 仓库列表
4. **找到并选择 `charlesnunot/Stratos`**
5. **点击 "Import"**

## 📝 步骤 3: 配置项目

### 项目设置（保持默认）

- **Framework Preset**: Next.js ✅
- **Root Directory**: `./` ✅
- **Build Command**: `npm run build` ✅
- **Output Directory**: `.next` ✅
- **Install Command**: `npm install` ✅

### 环境变量配置

在 "Environment Variables" 部分添加以下变量：

#### 必需变量：

```
NEXT_PUBLIC_SUPABASE_URL=你的_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=你的_supabase_service_role_key
CRON_SECRET=随机生成的密钥
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app（部署后更新）
NODE_ENV=production
```

#### 支付相关（根据使用的支付方式）：

```
STRIPE_SECRET_KEY=你的_stripe_secret_key（如果使用）
STRIPE_WEBHOOK_SECRET=你的_stripe_webhook_secret（如果使用）
PAYPAL_CLIENT_ID=你的_paypal_client_id（如果使用）
PAYPAL_CLIENT_SECRET=你的_paypal_client_secret（如果使用）
```

## 🎯 步骤 4: 部署

1. 点击 **"Deploy"** 按钮
2. 等待构建完成（通常 2-5 分钟）
3. 构建成功后，复制部署 URL

## ✅ 步骤 5: 更新应用 URL

1. 复制部署后的 URL（例如：`https://stratos-xxx.vercel.app`）
2. 在 Vercel 项目设置 → Environment Variables 中
3. 更新 `NEXT_PUBLIC_APP_URL` 为实际的生产 URL
4. 点击 "Redeploy" 重新部署

## 🔗 直接链接

如果找不到授权按钮，可以：

1. **访问 GitHub 应用设置**：
   - https://github.com/settings/installations
   - 查找 "Vercel" 应用
   - 如果没有，点击 "Configure" 或 "New installation"

2. **或者直接访问 Vercel 的 GitHub 集成页面**：
   - https://vercel.com/integrations/git/github
   - 点击 "Add GitHub" 或 "Configure"

## 🆘 如果仍然看不到仓库

1. **检查 GitHub 账户**：
   - 确认您使用的是正确的 GitHub 账户登录 Vercel
   - 确认 `charlesnunot/Stratos` 仓库存在且您有访问权限

2. **重新授权**：
   - 访问：https://github.com/settings/installations
   - 找到 Vercel 应用
   - 点击 "Configure"
   - 确保选择了 `charlesnunot/Stratos` 仓库或选择了 "All repositories"

3. **刷新 Vercel 页面**：
   - 按 `F5` 或 `Ctrl+R` 刷新
   - 或者关闭并重新打开浏览器标签页

## 📋 快速检查清单

- [ ] 已安装 Vercel GitHub 应用程序
- [ ] 已授权访问 GitHub 仓库
- [ ] 在 Vercel 中能看到 `charlesnunot/Stratos` 仓库
- [ ] 已配置所有必需的环境变量
- [ ] 已点击 "Deploy" 开始部署
- [ ] 部署成功后更新了 `NEXT_PUBLIC_APP_URL`

## 🔧 生成 CRON_SECRET

在 PowerShell 中运行：

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

或使用在线随机字符串生成器。
