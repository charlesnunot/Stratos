# 快速推送指南

## ✅ 准备推送

**注意**：需要 GitHub Personal Access Token（从 https://github.com/settings/tokens 获取）

## 🚀 方法1：使用推送脚本（推荐）

1. **打开PowerShell**
   - 按 `Win + X`，选择 "Windows PowerShell"

2. **运行脚本**
   ```powershell
   cd C:\Users\admin\Desktop\Stratos
   .\push-to-github.ps1
   ```

3. **如果提示输入凭据**
   - Username: `charlesnunot`
   - Password: 您的 GitHub Personal Access Token（从 https://github.com/settings/tokens 获取）

## 🚀 方法2：手动推送

1. **打开PowerShell**
   ```powershell
   cd C:\Users\admin\Desktop\Stratos
   ```

2. **清除代理并推送**
   ```powershell
   $env:HTTP_PROXY = ""
   $env:HTTPS_PROXY = ""
   $env:http_proxy = ""
   $env:https_proxy = ""
   
   git push -u origin main
   ```

3. **输入凭据**
   - Username: `charlesnunot`
   - Password: 您的 GitHub Personal Access Token（从 https://github.com/settings/tokens 获取）

## 🚀 方法3：使用 Git 凭据管理器（推荐）

```powershell
cd C:\Users\admin\Desktop\Stratos

# 配置 Git 凭据管理器
git config --global credential.helper manager-core

# 清除代理
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:http_proxy = ""
$env:https_proxy = ""

# 推送（首次会提示输入凭据，之后会自动保存）
git push -u origin main
```

## ✅ 推送成功后

- 访问 https://github.com/charlesnunot/Stratos 查看您的代码
- 代码已同步，可以开始协作开发

## ⚠️ 安全提示

推送成功后，建议：
1. 将远程URL改回普通格式（不包含令牌）
2. 使用Git凭据管理器保存凭据
3. 不要将令牌提交到代码仓库
