# 更新个人访问令牌权限

## ⚠️ 问题

您的个人访问令牌缺少 `workflow` 权限，无法创建或更新 GitHub Actions 工作流。

错误信息：
```
refusing to allow a Personal Access Token to create or update workflow without `workflow` scope
```

## 🔧 解决方案

### 方法1：更新现有令牌权限（推荐）

1. **访问令牌页面**
   - 打开：https://github.com/settings/tokens
   - 找到 "Stratos Git Push" 令牌

2. **更新权限**
   - 点击令牌右侧的 "..." 菜单
   - 选择 "Edit"（编辑）
   - 在 "Select scopes" 部分，**勾选 `workflow` 权限**
   - 点击 "Update token"（更新令牌）

3. **重新推送**
   ```powershell
   cd C:\Users\admin\Desktop\Stratos
   .\push-pages-config.ps1
   ```

### 方法2：创建新令牌（如果无法编辑）

1. **创建新令牌**
   - 访问：https://github.com/settings/tokens
   - 点击 "Generate new token" → "Generate new token (classic)"

2. **配置权限**
   - **Note**: `Stratos Git Push (with workflow)`
   - **Expiration**: 选择合适的时间
   - **Scopes**: 勾选以下权限：
     - ✅ `repo` - 完整仓库访问权限
     - ✅ `workflow` - 更新 GitHub Actions 工作流
   - 点击 "Generate token"

3. **更新脚本中的令牌**
   - 打开 `push-pages-config.ps1`
   - 将旧令牌替换为新令牌
   - 保存文件

4. **重新推送**
   ```powershell
   cd C:\Users\admin\Desktop\Stratos
   .\push-pages-config.ps1
   ```

## 📋 完整权限列表

创建/更新令牌时，确保勾选：

- ✅ **repo** - 完整仓库访问权限（包括私有仓库）
- ✅ **workflow** - 更新 GitHub Actions 工作流

## ⚡ 快速操作

### 步骤1：更新令牌权限

1. 访问：https://github.com/settings/tokens
2. 找到 "Stratos Git Push" 令牌
3. 点击 "..." → "Edit"
4. 勾选 `workflow` 权限
5. 更新令牌

### 步骤2：重新推送

```powershell
cd C:\Users\admin\Desktop\Stratos
.\push-pages-config.ps1
```

## ✅ 完成后

更新权限并重新推送后：
1. 配置会成功推送到GitHub
2. 然后按照 `GITHUB_PAGES_QUICK_START.md` 的步骤2和3操作
3. 启用GitHub Pages并等待部署

## 🆘 如果仍然失败

如果更新权限后仍然失败，请：
1. 检查令牌是否已保存
2. 确认 `workflow` 权限已勾选
3. 尝试创建新令牌（方法2）
