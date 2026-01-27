# 修复 GitHub Token 推送保护问题

## 问题说明

GitHub 的推送保护功能检测到代码中包含 Personal Access Token，阻止了推送。这是 GitHub 的安全功能，防止敏感信息泄露。

## 解决方案

### 方案 1: 临时允许推送（快速解决）

1. **访问 GitHub 提供的允许链接**（需要登录）：
   ```
   https://github.com/charlesnunot/Stratos/security/secret-scanning/unblock-secret/38p3OgG4SGWsaeWAf3YGeiYkiV0
   ```

2. **点击 "Allow secret"** 临时允许推送

3. **立即推送代码**：
   ```powershell
   cd C:\Stratos
   git push -u origin main
   ```

4. **⚠️ 重要：推送成功后立即撤销该 token**
   - 访问：https://github.com/settings/tokens
   - 找到并撤销 token：`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`
   - 创建新的 token（如果需要）

### 方案 2: 从历史中移除 token（彻底解决）

如果希望彻底移除历史中的 token，需要重写 Git 历史：

1. **安装 BFG Repo-Cleaner**（推荐）：
   ```powershell
   # 使用 Chocolatey
   choco install bfg
   
   # 或下载：https://rtyley.github.io/bfg-repo-cleaner/
   ```

2. **创建替换文件**：
   创建 `tokens.txt` 文件，内容：
   ```
   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==>
   ```

3. **清理历史**：
   ```powershell
   cd C:\Stratos
   bfg --replace-text tokens.txt
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   ```

4. **强制推送**：
   ```powershell
   git push origin --force --all
   git push origin --force --tags
   ```

### 方案 3: 创建新仓库（最简单）

如果历史记录不重要，可以：

1. **在 GitHub 上创建新仓库**
2. **推送当前代码**（已修复 token 问题）
3. **删除旧仓库**（可选）

## 当前状态

✅ **已修复的文件**（已移除硬编码 token）：
- `force-push.ps1`
- `push-and-deploy.ps1`
- `fix-git-push.ps1`
- `push-pages-config.ps1`
- `push-now.ps1`
- `push-to-github.ps1`
- `GITHUB_PAGES_QUICK_START.md`
- `QUICK_PUSH.md`
- `DEPLOYMENT_STATUS.md`

⚠️ **需要处理**：
- Git 历史记录中仍然包含 token
- 需要从历史中移除或使用临时允许推送

## 推荐操作步骤

### 快速方案（推荐用于立即部署）

1. **使用 GitHub 允许链接临时允许推送**
   - 访问：https://github.com/charlesnunot/Stratos/security/secret-scanning/unblock-secret/38p3OgG4SGWsaeWAf3YGeiYkiV0
   - 点击 "Allow secret"

2. **提交修复并推送**：
   ```powershell
   cd C:\Stratos
   git add -A
   git commit -m "Remove hardcoded GitHub tokens from scripts"
   git push -u origin main
   ```

3. **撤销旧 token**：
   - 访问：https://github.com/settings/tokens
   - 撤销 token：`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`

4. **创建新 token**（如果需要）：
   - 访问：https://github.com/settings/tokens/new
   - 选择所需权限
   - 保存新 token（不要提交到代码中）

5. **配置 Git 凭据管理器**（避免硬编码）：
   ```powershell
   git config --global credential.helper manager-core
   ```

### 长期方案（彻底清理）

如果希望彻底移除历史中的 token：

1. 使用 BFG Repo-Cleaner 清理历史
2. 强制推送到 GitHub
3. 通知所有协作者重新克隆仓库

## 安全最佳实践

1. ✅ **永远不要将 token 提交到代码仓库**
2. ✅ **使用环境变量或 Git 凭据管理器**
3. ✅ **定期轮换 token**
4. ✅ **使用最小权限原则**（只授予必要的权限）
5. ✅ **如果 token 泄露，立即撤销**

## 下一步

1. ✅ 选择上述方案之一
2. ✅ 推送代码到 GitHub
3. ✅ 在 Vercel 上部署项目
4. ✅ 配置环境变量
5. ✅ 测试部署的应用

## 需要帮助？

- GitHub 文档：https://docs.github.com/en/code-security/secret-scanning
- Git 凭据管理器：https://github.com/GitCredentialManager/git-credential-manager
