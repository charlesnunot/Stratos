# 快速部署指南

## 当前状态

✅ **代码已准备好推送**
- 所有文件已提交到本地仓库
- 3 个提交待推送到 GitHub

⚠️ **推送遇到网络问题**
- 可能是代理设置导致的连接问题

## 解决方案

### 方案 1: 运行修复脚本（推荐）

```powershell
cd C:\Stratos
.\fix-git-push.ps1
```

这个脚本会：
- 清除所有代理设置
- 测试 GitHub 连接
- 尝试推送代码

### 方案 2: 手动清除代理并推送

```powershell
cd C:\Stratos

# 清除代理
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
git config --global --unset http.proxy
git config --global --unset https.proxy

# 推送
git push -u origin main
```

### 方案 3: 使用 SSH 连接（如果已配置 SSH 密钥）

```powershell
cd C:\Stratos

# 切换到 SSH URL
git remote set-url origin git@github.com:charlesnunot/Stratos.git

# 推送
git push -u origin main
```

### 方案 4: 检查并配置代理（如果需要代理）

如果您需要使用代理，请配置正确的代理地址：

```powershell
# 设置代理（替换为您的实际代理地址和端口）
git config --global http.proxy http://proxy.example.com:8080
git config --global https.proxy http://proxy.example.com:8080
```

## 推送成功后：部署到 Vercel

### 快速步骤

1. **访问 Vercel**
   - 打开 https://vercel.com
   - 使用 GitHub 账号登录

2. **导入项目**
   - 点击 "Add New Project"
   - 选择仓库：`charlesnunot/Stratos`
   - 点击 "Import"

3. **配置项目**
   - Framework: Next.js（自动检测）
   - 其他设置保持默认

4. **添加环境变量**
   
   在 "Environment Variables" 中添加：

   ```
   NEXT_PUBLIC_SUPABASE_URL=你的_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=你的_supabase_service_role_key
   CRON_SECRET=随机生成的密钥
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   NODE_ENV=production
   ```

   **注意：** `NEXT_PUBLIC_APP_URL` 在首次部署后需要更新为实际的 Vercel URL。

5. **部署**
   - 点击 "Deploy"
   - 等待构建完成

6. **更新 URL**
   - 部署成功后，复制生产 URL
   - 更新 `NEXT_PUBLIC_APP_URL` 环境变量
   - 重新部署

## 详细文档

- **完整部署指南**: 查看 `VERCEL_DEPLOYMENT_GUIDE.md`
- **部署状态**: 查看 `DEPLOYMENT_STATUS.md`

## 需要帮助？

如果推送仍然失败，请检查：

1. **网络连接**
   ```powershell
   Test-NetConnection github.com -Port 443
   ```

2. **Git 配置**
   ```powershell
   git config --list
   ```

3. **防火墙设置**
   - 确保允许 Git 和 PowerShell 访问网络

4. **GitHub 访问**
   - 在浏览器中访问 https://github.com
   - 确认可以正常访问

## 下一步

1. ✅ 运行 `fix-git-push.ps1` 尝试推送
2. ✅ 如果成功，在 Vercel 上部署
3. ✅ 配置环境变量
4. ✅ 测试部署的应用
