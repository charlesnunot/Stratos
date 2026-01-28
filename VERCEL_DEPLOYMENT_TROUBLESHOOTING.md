# Vercel 部署故障排除指南

## 🔍 部署失败后的步骤

### 步骤 1: 查看详细错误日志

1. **点击 "Inspect Deployment"**（不是 "Go to Project"）
2. 查看 "Build Logs" 或 "Function Logs"
3. 找到错误信息（通常在日志末尾）

### 步骤 2: 常见错误及解决方案

#### 错误 1: 环境变量缺失

**错误信息：**
```
Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL
```

**解决方案：**
1. 在 Vercel 项目设置 → Environment Variables
2. 确认所有必需变量都已添加
3. 检查变量名拼写是否正确
4. 点击 "Redeploy" 重新部署

#### 错误 2: 构建失败

**错误信息：**
```
Error: Command "npm run build" exited with 1
```

**解决方案：**
1. 查看构建日志中的具体错误
2. 检查代码是否有语法错误
3. 确认所有依赖都已安装
4. 检查 TypeScript 类型错误

#### 错误 3: 依赖安装失败

**错误信息：**
```
npm ERR! code ELIFECYCLE
```

**解决方案：**
1. 检查 `package.json` 是否正确
2. 确认 Node.js 版本兼容（Vercel 默认使用 18.x）
3. 在 Vercel 项目设置中指定 Node.js 版本

#### 错误 4: 环境变量验证失败

**错误信息：**
```
Environment validation failed
```

**解决方案：**
1. 确认所有必需环境变量都已配置
2. 检查变量值是否正确（不是占位符）
3. 确认 `NODE_ENV=production` 已设置

## 🔧 快速修复步骤

### 1. 检查环境变量

在 Vercel 项目设置中确认以下变量：

- [ ] `NEXT_PUBLIC_SUPABASE_URL` - 已添加且值正确
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - 已添加且值正确
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - 已添加且值正确
- [ ] `CRON_SECRET` - 已添加（随机生成的密钥）
- [ ] `NODE_ENV` - 设置为 `production`
- [ ] `NEXT_PUBLIC_APP_URL` - 已添加（临时值即可）

### 2. 查看构建日志

1. 点击 "Inspect Deployment"
2. 展开 "Build Logs"
3. 查找红色错误信息
4. 复制错误信息

### 3. 重新部署

修复问题后：
1. 在 Vercel 项目页面
2. 点击 "Redeploy" 或 "Deployments" → "Redeploy"

## 📋 检查清单

部署前确认：

- [ ] 所有必需环境变量已配置
- [ ] 环境变量值正确（不是占位符）
- [ ] 代码已推送到 GitHub
- [ ] `package.json` 中的依赖正确
- [ ] 没有 TypeScript 类型错误
- [ ] 没有构建错误

## 🆘 需要帮助？

如果仍然无法解决：

1. **复制完整的错误日志**
2. **检查以下内容**：
   - 环境变量配置
   - 构建日志中的具体错误
   - GitHub 仓库中的最新代码

3. **常见问题**：
   - 环境变量未正确配置
   - 代码中有语法错误
   - 依赖版本不兼容
   - Node.js 版本问题
