# GitHub 仓库创建和连接指南

## 步骤 1: 在 GitHub 上创建新仓库

1. **登录 GitHub**
   - 访问 [https://github.com](https://github.com)
   - 使用您的账户登录

2. **创建新仓库**
   - 点击右上角的 "+" 图标
   - 选择 "New repository"（新建仓库）

3. **配置仓库信息**
   - **Repository name（仓库名称）**: `Stratos`（建议与项目名称一致）
   - **Description（描述）**: 可选，例如："一个集社交、电商、即时聊天于一体的综合平台"
   - **Visibility（可见性）**: 选择 **Public（公开）**
   - **⚠️ 重要**: **不要**勾选以下选项：
     - ❌ Add a README file（已存在 README.md）
     - ❌ Add .gitignore（已存在 .gitignore）
     - ❌ Choose a license（可选，稍后添加）

4. **创建仓库**
   - 点击 "Create repository" 按钮

## 步骤 2: 获取仓库 URL

创建仓库后，GitHub 会显示仓库页面。您会看到类似这样的 URL：

```
https://github.com/您的用户名/Stratos.git
```

或者 SSH 格式（如果您配置了 SSH 密钥）：
```
git@github.com:您的用户名/Stratos.git
```

**请复制这个 URL，稍后连接远程仓库时会用到。**

## 步骤 3: 连接本地仓库到 GitHub

创建仓库后，请告诉我您的 GitHub 仓库 URL，我将帮您完成以下操作：

1. 添加远程仓库地址
2. 将本地分支重命名为 `main`（GitHub 默认分支）
3. 推送代码到 GitHub
4. 设置上游分支跟踪

## 注意事项

- ✅ 确保 `.env` 和 `.env.local` 等敏感文件已被 `.gitignore` 忽略
- ✅ `node_modules` 和 `.next` 目录已在忽略列表中
- ✅ 所有代码已提交到本地 Git 仓库

## 后续协作开发

完成连接后，团队成员可以：

```bash
# 克隆仓库
git clone https://github.com/您的用户名/Stratos.git

# 创建功能分支
git checkout -b feature/新功能名称

# 提交更改
git add .
git commit -m "描述您的更改"

# 推送分支
git push origin feature/新功能名称
```

然后在 GitHub 上创建 Pull Request 进行代码审查。
