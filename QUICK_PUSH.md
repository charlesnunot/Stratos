# 快速推送指南

## ✅ 您的令牌已准备好

**令牌**：`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`

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
   - Password: `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`

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
   - Password: `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`

## 🚀 方法3：使用包含令牌的URL（一次性）

```powershell
cd C:\Users\admin\Desktop\Stratos

# 设置包含令牌的URL
git remote set-url origin https://charlesnunot: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@github.com/charlesnunot/Stratos.git

# 清除代理
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:http_proxy = ""
$env:https_proxy = ""

# 推送
git push -u origin main

# 推送成功后，改回普通URL（安全考虑）
git remote set-url origin https://github.com/charlesnunot/Stratos.git
```

## ✅ 推送成功后

- 访问 https://github.com/charlesnunot/Stratos 查看您的代码
- 代码已同步，可以开始协作开发

## ⚠️ 安全提示

推送成功后，建议：
1. 将远程URL改回普通格式（不包含令牌）
2. 使用Git凭据管理器保存凭据
3. 不要将令牌提交到代码仓库
