# GitHub Pages 快速启动指南

## ⚠️ 当前状态

配置已创建但**尚未推送到GitHub**，需要完成以下步骤：

---

## 🚀 立即操作（3步）

### 步骤1：推送配置到GitHub

**方法A：使用脚本（推荐）**
```powershell
cd C:\Users\admin\Desktop\Stratos
.\push-pages-config.ps1
```

**方法B：手动推送**
```powershell
cd C:\Users\admin\Desktop\Stratos

# 清除代理
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:http_proxy = ""
$env:https_proxy = ""

# 设置包含令牌的URL
git remote set-url origin https://github.com/charlesnunot/Stratos.git

# 推送
git push origin main

# 推送成功后改回普通URL
git remote set-url origin https://github.com/charlesnunot/Stratos.git
```

### 步骤2：启用GitHub Pages

1. **访问设置页面**
   - 打开：https://github.com/charlesnunot/Stratos/settings/pages

2. **配置Pages源**
   - 在 "Source" 部分
   - **选择 "GitHub Actions"**（重要！不要选择 "Deploy from a branch"）
   - 点击 "Save"

3. **等待配置生效**（约1-2分钟）

### 步骤3：等待自动部署

1. **查看Actions状态**
   - 访问：https://github.com/charlesnunot/Stratos/actions
   - 找到 "Deploy to GitHub Pages" 工作流
   - 等待运行完成（约5-10分钟）

2. **检查部署状态**
   - 如果成功，会显示绿色✓
   - 如果失败，点击查看错误日志

3. **访问网站**
   - 部署成功后访问：https://charlesnunot.github.io/Stratos/

---

## ✅ 检查清单

完成以下所有步骤：

- [ ] 配置已推送到GitHub（步骤1）
- [ ] GitHub Pages已启用并选择"GitHub Actions"（步骤2）
- [ ] GitHub Actions工作流已成功运行（步骤3）
- [ ] 网站可以正常访问

---

## 🔍 如果仍然404

### 检查1：GitHub Pages设置
- 确认选择了 "GitHub Actions" 而不是 "Deploy from a branch"
- 访问：https://github.com/charlesnunot/Stratos/settings/pages

### 检查2：Actions工作流
- 查看是否有错误：https://github.com/charlesnunot/Stratos/actions
- 如果失败，点击查看详细错误信息

### 检查3：等待时间
- GitHub Actions需要5-10分钟完成构建和部署
- 部署完成后，网站可能需要1-2分钟才能访问

### 检查4：构建错误
如果Actions失败，可能的原因：
1. **Next.js构建错误** - 检查代码是否有错误
2. **依赖问题** - 检查package.json
3. **环境变量缺失** - 如果使用Supabase，可能需要配置Secrets

---

## 📝 配置环境变量（如果需要）

如果应用需要Supabase配置：

1. 访问：https://github.com/charlesnunot/Stratos/settings/secrets/actions
2. 点击 "New repository secret"
3. 添加：
   - Name: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: 您的Supabase URL
4. 再添加：
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Value: 您的Supabase匿名密钥
5. 重新触发部署

---

## 🆘 需要帮助？

如果遇到问题，请告诉我：
1. GitHub Actions的状态（成功/失败）
2. 如果有错误，错误信息是什么
3. GitHub Pages设置是否已选择"GitHub Actions"

---

## 🎯 完成后的效果

部署成功后：
- ✅ 网站可以访问：https://charlesnunot.github.io/Stratos/
- ✅ 每次推送到main分支会自动更新网站
- ✅ 可以在GitHub上查看部署历史

现在开始执行步骤1，推送配置到GitHub！
