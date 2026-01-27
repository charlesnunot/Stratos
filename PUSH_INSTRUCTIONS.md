# 推送代码到GitHub - 操作指南

## 您已经准备好了：
✅ 个人访问令牌已创建（Stratos Git Push）  
✅ 本地代码已提交  
✅ 远程仓库已连接  

## 现在需要做的：

### 方法1：在终端中手动推送（推荐）

1. **打开PowerShell或命令提示符**
   - 按 `Win + X`，选择 "Windows PowerShell" 或 "终端"

2. **导航到项目目录**
   ```powershell
   cd C:\Users\admin\Desktop\Stratos
   ```

3. **清除代理环境变量（临时）**
   ```powershell
   $env:HTTP_PROXY = ""
   $env:HTTPS_PROXY = ""
   $env:http_proxy = ""
   $env:https_proxy = ""
   ```

4. **推送代码**
   ```powershell
   git push -u origin main
   ```

5. **输入凭据**
   当系统提示时：
   - **Username（用户名）**: 输入 `charlesnunot`
   - **Password（密码）**: **输入您的个人访问令牌**（不是GitHub密码）
     - 令牌格式类似：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
     - 您可以在 https://github.com/settings/tokens 查看令牌（但不会显示完整内容）

6. **完成**
   推送成功后，您会看到类似这样的输出：
   ```
   Enumerating objects: 388, done.
   Counting objects: 100% (388/388), done.
   ...
   To https://github.com/charlesnunot/Stratos.git
    * [new branch]      main -> main
   Branch 'main' set up to track remote branch 'main' from 'origin'.
   ```

### 方法2：在URL中包含令牌（临时方案，不推荐用于长期使用）

如果您想一次性推送而不每次都输入凭据，可以临时在URL中包含令牌：

```powershell
# 设置包含令牌的远程URL（临时）
git remote set-url origin https://您的令牌@github.com/charlesnunot/Stratos.git

# 清除代理
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:http_proxy = ""
$env:https_proxy = ""

# 推送
git push -u origin main

# 推送完成后，建议改回普通URL（安全考虑）
git remote set-url origin https://github.com/charlesnunot/Stratos.git
```

⚠️ **注意**：使用后请立即改回普通URL，避免令牌泄露。

### 方法3：使用Git Credential Manager（推荐用于长期使用）

1. **配置凭据管理器**
   ```powershell
   git config --global credential.helper manager-core
   ```

2. **第一次推送时输入凭据**
   - 系统会弹出Windows凭据管理器窗口
   - 输入用户名和令牌
   - 以后推送会自动使用保存的凭据

## 如果遇到问题

### 问题1：仍然提示代理错误
```powershell
# 检查并清除所有代理设置
git config --local --unset http.proxy
git config --local --unset https.proxy
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
```

### 问题2：找不到令牌
- 访问：https://github.com/settings/tokens
- 如果令牌已过期或丢失，需要创建新令牌

### 问题3：权限被拒绝
- 确保令牌有 `repo` 权限
- 检查令牌是否已过期（您的令牌有效期至2026年1月26日）

## 推送成功后

✅ 代码已同步到GitHub  
✅ 团队成员可以克隆仓库  
✅ 可以开始协作开发  

访问 https://github.com/charlesnunot/Stratos 查看您的代码！
