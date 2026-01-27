# 部署状态和下一步操作

## 当前状态

✅ **已完成：**
- 创建了推送脚本：`push-and-deploy.ps1`
- 创建了 Vercel 部署指南：`VERCEL_DEPLOYMENT_GUIDE.md`
- 项目已准备好部署

⚠️ **待完成：**
- 推送到 GitHub（遇到网络连接问题）
- 在 Vercel 上部署项目

## 推送到 GitHub

### 方法 1: 使用提供的脚本（推荐）

1. **打开 PowerShell（以管理员身份运行）**
2. **导航到项目目录：**
   ```powershell
   cd C:\Stratos
   ```
3. **运行推送脚本：**
   ```powershell
   .\push-and-deploy.ps1
   ```

### 方法 2: 手动推送

如果脚本遇到问题，可以手动执行以下命令：

```powershell
# 1. 进入项目目录
cd C:\Stratos

# 2. 检查状态
git status

# 3. 添加所有更改
git add .

# 4. 提交更改
git commit -m "Add deployment scripts and prepare for Vercel deployment"

# 5. 配置远程仓库（如果需要）
git remote set-url origin https://github.com/charlesnunot/Stratos.git

# 6. 推送到 GitHub
git push -u origin main
```

### 如果遇到网络问题

1. **检查代理设置：**
   ```powershell
   # 清除代理
   $env:HTTP_PROXY = $null
   $env:HTTPS_PROXY = $null
   git config --global --unset http.proxy
   git config --global --unset https.proxy
   ```

2. **使用 SSH 连接（如果已配置 SSH 密钥）：**
   ```powershell
   git remote set-url origin git@github.com:charlesnunot/Stratos.git
   git push -u origin main
   ```

3. **检查 GitHub 连接：**
   ```powershell
   # 测试连接
   Test-NetConnection github.com -Port 443
   ```

## Vercel 部署步骤

### 快速部署（推荐）

1. **访问 Vercel**
   - 打开 https://vercel.com
   - 使用 GitHub 账号登录

2. **导入项目**
   - 点击 "Add New Project"
   - 选择仓库：`charlesnunot/Stratos`
   - 点击 "Import"

3. **配置项目**
   - Framework: Next.js（自动检测）
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

4. **添加环境变量**
   
   在 "Environment Variables" 中添加以下变量：

   **必需变量：**
   ```
   NEXT_PUBLIC_SUPABASE_URL=你的_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=你的_supabase_service_role_key
   CRON_SECRET=你的_cron_secret（随机字符串）
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app（部署后更新）
   NODE_ENV=production
   ```

   **支付相关（根据使用的支付方式）：**
   ```
   STRIPE_SECRET_KEY=你的_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=你的_stripe_webhook_secret
   PAYPAL_CLIENT_ID=你的_paypal_client_id
   PAYPAL_CLIENT_SECRET=你的_paypal_client_secret
   # ... 其他支付方式
   ```

5. **部署**
   - 点击 "Deploy"
   - 等待构建完成（2-5 分钟）

6. **更新环境变量**
   - 部署成功后，复制生产 URL
   - 更新 `NEXT_PUBLIC_APP_URL` 为实际的生产 URL
   - 重新部署以应用更改

### 使用 Vercel CLI

```powershell
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 部署
cd C:\Stratos
vercel

# 4. 生产环境部署
vercel --prod
```

## 环境变量清单

在 Vercel 项目设置中配置以下环境变量：

### 必需变量
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `CRON_SECRET`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `NODE_ENV=production`

### 可选变量（根据功能需要）
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `PAYPAL_CLIENT_ID`
- [ ] `PAYPAL_CLIENT_SECRET`
- [ ] `ALIPAY_APP_ID`
- [ ] `ALIPAY_PRIVATE_KEY`
- [ ] `ALIPAY_PUBLIC_KEY`
- [ ] `WECHAT_PAY_APP_ID`
- [ ] `WECHAT_PAY_MCH_ID`
- [ ] `WECHAT_PAY_API_KEY`

## 部署后检查

- [ ] 网站可以正常访问
- [ ] 所有页面路由正常
- [ ] 数据库连接正常
- [ ] 支付功能正常（如果已配置）
- [ ] 定时任务正常运行
- [ ] 环境变量都已配置
- [ ] 生产 URL 已更新

## 定时任务配置

项目已配置了以下定时任务（在 `vercel.json` 中）：

- 检查发货超时：每天 02:00
- 发送发货提醒：每天 09:00
- 订阅生命周期管理：每天 03:00
- 订阅到期提醒：每天 10:00
- 更新保证金批次状态：每天 04:00
- 收集债务：每天 02:00
- 自动升级纠纷：每小时
- 扣除逾期佣金：每天 03:00
- 检查订阅降级：每天 11:00
- 发送订单到期提醒：每 5 分钟
- 取消过期订单：每 5 分钟

确保在 Vercel 中启用 Cron Jobs 功能。

## 故障排除

### 构建失败
1. 检查 Node.js 版本（Vercel 默认使用 18.x）
2. 检查所有依赖是否在 `package.json` 中
3. 检查环境变量是否正确配置

### 运行时错误
1. 查看 Vercel 函数日志
2. 检查 Supabase 连接
3. 验证环境变量值

### 网络问题
1. 检查代理设置
2. 尝试使用 SSH 连接
3. 检查防火墙设置

## 支持资源

- Vercel 文档：https://vercel.com/docs
- Next.js 文档：https://nextjs.org/docs
- Supabase 文档：https://supabase.com/docs

## 下一步

1. ✅ 完成代码推送到 GitHub
2. ✅ 在 Vercel 上创建项目
3. ✅ 配置环境变量
4. ✅ 完成首次部署
5. ✅ 测试所有功能
6. ✅ 配置自定义域名（可选）
