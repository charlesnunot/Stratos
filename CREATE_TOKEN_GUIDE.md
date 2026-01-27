# 创建个人访问令牌 - 详细步骤

## 当前页面：New personal access token (classic)

您正在创建新令牌，请按照以下步骤填写：

---

## 📝 步骤1：填写备注（Note）

**What's this token for?** 字段

- **输入**：`Stratos Git Push`
- 或任何您容易识别的名称，如：`Stratos项目开发`、`Stratos仓库推送`等
- 这个名称只是用来标识令牌的用途，可以随意填写

---

## 📅 步骤2：选择过期时间（Expiration）

**The token will expire on the selected date**

### 推荐选项：

1. **90 days（90天）** - 推荐用于开发项目
2. **Custom（自定义）** - 可以设置更长时间，如：
   - 6个月
   - 1年
   - 或选择 "No expiration"（永不过期）- ⚠️ 不推荐，安全性较低

### 建议：
- 如果只是临时使用：选择 **30 days** 或 **90 days**
- 如果是长期项目：选择 **Custom**，设置6个月或1年
- 您的项目令牌有效期至2026年1月26日，说明您之前可能选择了较长时间

---

## ✅ 步骤3：选择权限（Select scopes）

**这是最重要的步骤！**

### 必须勾选的权限：

#### ✅ **repo** - 完整仓库访问权限
- **位置**：在权限列表中找到 "repo"
- **说明**：Full control of private repositories
- **必须勾选**：这是推送代码到GitHub仓库所必需的权限
- 勾选后会自动包含以下子权限：
  - repo:status
  - repo_deployment
  - public_repo
  - repo:invite
  - security_events

### 可选权限（通常不需要）：
- ❌ workflow - 如果需要GitHub Actions
- ❌ write:packages - 如果需要发布包
- ❌ delete:packages - 如果需要删除包
- ❌ 其他权限 - 根据您的具体需求

### ⚠️ 重要提示：
- **只需要勾选 `repo` 权限即可**
- 不要勾选过多不必要的权限（安全最佳实践）
- 如果只勾选 `repo`，就足够推送代码了

---

## 🎯 完整配置示例

### 推荐配置：

```
Note: Stratos Git Push
Expiration: 90 days (或 Custom - 6 months)
Scopes: ✅ repo
```

### 最小配置（仅推送代码）：

```
Note: Stratos Git Push
Expiration: 90 days
Scopes: ✅ repo (仅此一个)
```

---

## 🚀 步骤4：生成令牌

1. **滚动到页面底部**
2. **点击绿色的 "Generate token" 按钮**

---

## 💾 步骤5：保存令牌（非常重要！）

### ⚠️ 警告：
- **令牌只会显示一次！**
- 离开页面后无法再次查看完整令牌
- 必须立即复制并保存

### 操作步骤：

1. **立即复制令牌**
   - 令牌格式：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - 点击令牌右侧的复制图标，或全选复制

2. **保存到安全的地方**
   - 建议保存到：
     - 密码管理器（如1Password、LastPass等）
     - 本地文本文件（加密或安全位置）
     - 记事本（临时，使用后删除）

3. **不要分享给他人**
   - 令牌等同于您的密码
   - 泄露后应立即撤销并重新生成

---

## 📋 配置检查清单

在点击 "Generate token" 之前，确认：

- [ ] Note已填写（如：Stratos Git Push）
- [ ] 过期时间已选择（推荐90天或自定义）
- [ ] ✅ repo 权限已勾选
- [ ] 其他不必要的权限未勾选
- [ ] 准备好保存令牌的地方

---

## 🔄 如果已有令牌

如果您之前已经创建过 "Stratos Git Push" 令牌：

1. **选项A：使用现有令牌**
   - 访问：https://github.com/settings/tokens
   - 找到现有令牌
   - 如果忘记了完整内容，需要重新生成

2. **选项B：重新生成**
   - 在现有令牌右侧点击 "..."
   - 选择 "Regenerate token"
   - ⚠️ 旧令牌将立即失效
   - 按照上述步骤创建新令牌

---

## ✅ 生成后的下一步

令牌生成并保存后：

1. **复制令牌**（格式：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）
2. **保存到安全位置**
3. **准备在本地终端使用**（见 `PUSH_INSTRUCTIONS.md`）

---

## 🆘 需要帮助？

如果在创建过程中遇到问题：
- 找不到 "repo" 权限选项
- 不确定选择哪个过期时间
- 其他配置问题

请告诉我，我会立即协助您！
