# Vercel 环境变量配置指南

## 📋 必需环境变量清单

### 必须添加的变量（否则应用无法运行）

1. **NEXT_PUBLIC_SUPABASE_URL**
   - 值：您的 Supabase 项目 URL（例如：`https://xxxxx.supabase.co`）
   - 获取方式：Supabase 项目设置 → API → Project URL

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - 值：您的 Supabase 匿名密钥（以 `eyJhbGc...` 开头）
   - 获取方式：Supabase 项目设置 → API → anon/public key

3. **SUPABASE_SERVICE_ROLE_KEY**
   - 值：您的 Supabase 服务角色密钥（以 `eyJhbGc...` 开头）
   - 获取方式：Supabase 项目设置 → API → service_role key（⚠️ 保密，不要泄露）

4. **CRON_SECRET**
   - 值：随机生成的密钥（32 字符以上）
   - 生成方式：见下方

5. **NODE_ENV**
   - 值：`production`
   - 说明：固定值，表示生产环境

### 推荐添加的变量

6. **NEXT_PUBLIC_APP_URL**
   - 值：先设置为 `https://stratos.vercel.app`（部署后会得到实际 URL，再更新）
   - 说明：部署成功后，更新为实际的生产 URL

### 可选变量（根据使用的支付方式）

**如果使用 Stripe：**
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

**如果使用 PayPal：**
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`

**如果使用 Alipay：**
- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`

**如果使用 WeChat Pay：**
- `WECHAT_PAY_APP_ID`
- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_API_KEY`

## 🔧 在 Vercel 中添加环境变量

### 步骤 1: 添加每个变量

1. 在 "Environment Variables" 部分
2. 点击 **"Add"** 按钮
3. 输入 **Key**（变量名）
4. 输入 **Value**（变量值）
5. 选择环境：建议选择 **Production, Preview, Development**（全选）
6. 点击 **"Save"**
7. 重复以上步骤添加所有变量

### 步骤 2: 添加顺序（建议）

按以下顺序添加：

1. ✅ `NEXT_PUBLIC_SUPABASE_URL` = `你的_supabase_url`
2. ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `你的_anon_key`
3. ✅ `SUPABASE_SERVICE_ROLE_KEY` = `你的_service_role_key`
4. ✅ `CRON_SECRET` = `生成的随机密钥`
5. ✅ `NODE_ENV` = `production`
6. ✅ `NEXT_PUBLIC_APP_URL` = `https://stratos.vercel.app`（临时值）

## 🔑 生成 CRON_SECRET

在 PowerShell 中运行：

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

或者使用在线工具：https://www.random.org/strings/

## 📍 获取 Supabase 配置

1. 访问：https://supabase.com/dashboard
2. 选择您的项目
3. 进入 **Settings** → **API**
4. 复制以下值：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

## ⚠️ 重要提示

1. **不要使用 import.env**：`.env.example` 文件包含的是占位符值，不能直接导入使用
2. **必须填写实际值**：所有变量都需要填写真实的值，不能使用 `your_supabase_url` 这样的占位符
3. **保密性**：`SUPABASE_SERVICE_ROLE_KEY` 和支付相关的密钥都是敏感信息，不要泄露
4. **环境选择**：建议为所有变量选择 "Production, Preview, Development"（全选）

## ✅ 配置完成后

添加完所有必需变量后：
1. 检查变量列表，确保所有必需变量都已添加
2. 确认变量值都已正确填写（不是占位符）
3. 点击 **"Deploy"** 按钮开始部署

## 🆘 如果没有 Supabase 配置

如果您还没有 Supabase 项目：

1. **可以先部署**（应用会显示配置错误，但可以部署）
2. **部署后配置**：在 Vercel 项目设置中继续添加环境变量
3. **重新部署**：配置完成后点击 "Redeploy"

但建议先配置好 Supabase，这样可以确保应用正常运行。
