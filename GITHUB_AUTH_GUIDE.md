# GitHub 认证配置指南

## 问题说明

当前Git代理问题已解决，但需要配置GitHub认证才能推送代码。

## 解决方案

### 方案1：使用个人访问令牌（Personal Access Token，推荐）

GitHub已不再支持使用密码进行HTTPS推送，需要使用个人访问令牌。

#### 步骤1：创建个人访问令牌

1. **登录GitHub**
   - 访问 https://github.com
   - 登录您的账户

2. **创建令牌**
   - 点击右上角头像 → **Settings（设置）**
   - 左侧菜单选择 **Developer settings（开发者设置）**
   - 选择 **Personal access tokens** → **Tokens (classic)**
   - 点击 **Generate new token** → **Generate new token (classic)**

3. **配置令牌**
   - **Note（备注）**: 输入描述，如 "Stratos项目开发"
   - **Expiration（过期时间）**: 选择合适的时间（建议90天或自定义）
   - **Scopes（权限）**: 至少勾选以下权限：
     - ✅ `repo` - 完整仓库访问权限（包括私有仓库）
   - 点击 **Generate token（生成令牌）**

4. **保存令牌**
   - ⚠️ **重要**：令牌只会显示一次，请立即复制并保存
   - 格式类似：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### 步骤2：使用令牌推送代码

在推送时，当Git提示输入密码时，**使用令牌代替密码**：

```bash
cd c:\Users\admin\Desktop\Stratos
git push -u origin main
```

当提示输入用户名和密码时：
- **Username（用户名）**: 输入您的GitHub用户名（charlesnunot）
- **Password（密码）**: **输入刚才复制的个人访问令牌**（不是您的GitHub密码）

#### 步骤3：配置Git凭据管理器（可选，推荐）

为了避免每次推送都输入令牌，可以配置Git凭据管理器：

```bash
# Windows凭据管理器会自动保存
git config --global credential.helper manager-core
```

### 方案2：使用SSH连接（如果已配置SSH密钥）

如果您已经配置了SSH密钥，可以改用SSH连接：

```bash
# 更改远程仓库URL为SSH格式
git remote set-url origin git@github.com:charlesnunot/Stratos.git

# 推送代码
git push -u origin main
```

#### 检查SSH密钥

```bash
# 检查是否存在SSH密钥
ls ~/.ssh/id_*.pub
```

#### 如果没有SSH密钥，可以生成一个

```bash
# 生成新的SSH密钥
ssh-keygen -t ed25519 -C "your_email@example.com"

# 启动ssh-agent
eval "$(ssh-agent -s)"

# 添加SSH密钥
ssh-add ~/.ssh/id_ed25519

# 复制公钥内容
cat ~/.ssh/id_ed25519.pub
```

然后将公钥添加到GitHub：
1. GitHub → Settings → SSH and GPG keys
2. 点击 "New SSH key"
3. 粘贴公钥内容
4. 保存

## 推荐方案

**推荐使用方案1（个人访问令牌）**，因为：
- 设置简单快速
- 可以设置过期时间，更安全
- 可以随时撤销
- 适合HTTPS连接

## 完成推送后

推送成功后，您的代码将同步到GitHub，团队成员就可以：
- 克隆仓库
- 创建分支
- 提交更改
- 创建Pull Request
