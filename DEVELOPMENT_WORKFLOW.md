# 使用Git/GitHub开发的新工作流程

## 🔄 主要区别

### 之前（无版本控制）
- ❌ 直接在主代码上修改，容易出错
- ❌ 没有代码历史记录
- ❌ 无法回退到之前的版本
- ❌ 多人协作困难，容易代码冲突
- ❌ 没有代码审查机制
- ❌ 无法追踪谁做了什么改动

### 现在（使用Git/GitHub）
- ✅ 使用分支开发，主代码安全
- ✅ 完整的代码历史记录
- ✅ 可以随时回退到任何版本
- ✅ 多人协作顺畅，自动合并
- ✅ 代码审查（Pull Request）
- ✅ 清晰的提交记录和责任人

---

## 📋 新的开发工作流程

### 1. 开始新功能开发

**之前**：
```bash
# 直接在主代码上修改
# 如果出错，需要手动撤销
```

**现在**：
```bash
# 创建功能分支
git checkout -b feature/用户登录功能

# 在分支上安全开发
# 主代码（main分支）不受影响
```

### 2. 保存代码更改

**之前**：
```bash
# 手动复制文件备份
# 或者直接覆盖，无法恢复
```

**现在**：
```bash
# 提交更改到本地仓库
git add .
git commit -m "添加用户登录功能"

# 可以随时查看历史
git log

# 可以回退到任何提交
git reset --hard <commit-id>
```

### 3. 同步到GitHub

**之前**：
```bash
# 需要手动上传文件
# 或者使用FTP等工具
# 容易遗漏文件
```

**现在**：
```bash
# 推送到GitHub
git push origin feature/用户登录功能

# 自动同步所有更改
# GitHub上可以看到完整代码
```

### 4. 代码审查和合并

**之前**：
```bash
# 直接合并代码
# 没有审查过程
# 容易引入bug
```

**现在**：
```bash
# 在GitHub上创建Pull Request
# 团队成员审查代码
# 通过审查后合并到main分支
# 保证代码质量
```

---

## 🎯 日常开发步骤

### 场景1：开发新功能

```bash
# 1. 从main分支创建新分支
git checkout main
git pull origin main  # 获取最新代码
git checkout -b feature/新功能名称

# 2. 开发功能
# ... 编写代码 ...

# 3. 提交更改
git add .
git commit -m "实现新功能：描述"

# 4. 推送到GitHub
git push origin feature/新功能名称

# 5. 在GitHub上创建Pull Request
# 6. 代码审查通过后合并
```

### 场景2：修复Bug

```bash
# 1. 创建bug修复分支
git checkout -b fix/修复登录bug

# 2. 修复bug
# ... 修复代码 ...

# 3. 提交修复
git add .
git commit -m "修复：登录功能bug"

# 4. 推送并创建PR
git push origin fix/修复登录bug
```

### 场景3：更新代码

**之前**：
```bash
# 需要手动检查哪些文件被修改
# 容易遗漏更新
```

**现在**：
```bash
# 获取最新代码
git pull origin main

# 自动合并更改
# 如果有冲突，Git会提示
```

---

## 🔍 版本控制的好处

### 1. 代码历史

```bash
# 查看所有提交历史
git log

# 查看特定文件的修改历史
git log -- src/components/Login.tsx

# 查看两次提交之间的差异
git diff <commit1> <commit2>
```

### 2. 回退功能

```bash
# 回退到上一个提交
git reset --hard HEAD~1

# 回退到特定提交
git reset --hard <commit-id>

# 查看所有提交（包括已删除的）
git reflog
```

### 3. 分支管理

```bash
# 查看所有分支
git branch -a

# 切换分支
git checkout <branch-name>

# 删除分支
git branch -d <branch-name>
```

---

## 👥 多人协作

### 之前的问题
- ❌ 多人同时修改同一文件，后保存的覆盖前面的
- ❌ 不知道谁改了哪里
- ❌ 无法合并多个人的更改

### 现在的优势
- ✅ 每个人在独立分支开发
- ✅ Git自动合并更改
- ✅ 清晰的提交记录
- ✅ 代码审查确保质量

### 协作流程

```bash
# 团队成员A
git checkout -b feature/功能A
# ... 开发 ...
git push origin feature/功能A
# 创建PR

# 团队成员B（同时）
git checkout -b feature/功能B
# ... 开发 ...
git push origin feature/功能B
# 创建PR

# 两个功能互不干扰
# 可以同时开发
```

---

## 📊 GitHub功能

### 1. Issues（问题追踪）

- 记录bug和功能需求
- 分配给开发者
- 追踪进度
- 关联代码提交

### 2. Pull Requests（代码审查）

- 代码审查
- 讨论改进
- 自动化测试
- 合并代码

### 3. Actions（CI/CD）

- 自动运行测试
- 自动部署
- 代码质量检查

### 4. Projects（项目管理）

- 看板管理
- 任务追踪
- 进度可视化

---

## 🛠️ 常用命令

### 日常开发

```bash
# 查看状态
git status

# 查看更改
git diff

# 添加文件
git add <file>
git add .  # 添加所有更改

# 提交
git commit -m "描述"

# 推送
git push origin <branch-name>

# 拉取
git pull origin <branch-name>
```

### 分支操作

```bash
# 创建分支
git checkout -b <branch-name>

# 切换分支
git checkout <branch-name>

# 查看分支
git branch

# 删除分支
git branch -d <branch-name>
```

### 查看历史

```bash
# 查看提交历史
git log

# 查看文件历史
git log -- <file>

# 查看更改统计
git log --stat
```

---

## ⚠️ 注意事项

### 1. 提交前检查

```bash
# 查看将要提交的更改
git diff --staged

# 查看所有更改
git status
```

### 2. 提交信息规范

```bash
# 好的提交信息
git commit -m "feat: 添加用户登录功能"
git commit -m "fix: 修复登录bug"
git commit -m "docs: 更新README"

# 不好的提交信息
git commit -m "更新"
git commit -m "修改"
```

### 3. 定期同步

```bash
# 每天开始工作前
git pull origin main

# 推送前先拉取
git pull origin main
git push origin <branch-name>
```

### 4. 处理冲突

```bash
# 如果合并时有冲突
# Git会标记冲突文件
# 手动解决冲突后
git add <resolved-file>
git commit -m "解决合并冲突"
```

---

## 🎓 学习资源

### Git基础
- `git status` - 查看状态
- `git add` - 添加文件
- `git commit` - 提交更改
- `git push` - 推送到远程
- `git pull` - 拉取远程更改

### 分支管理
- `git branch` - 查看分支
- `git checkout` - 切换分支
- `git merge` - 合并分支

### 查看历史
- `git log` - 查看提交历史
- `git diff` - 查看差异
- `git show` - 查看提交详情

---

## 📝 最佳实践

### 1. 提交频率
- ✅ 完成一个小功能就提交
- ✅ 修复一个bug就提交
- ❌ 不要积累大量更改再提交

### 2. 提交信息
- ✅ 清晰描述做了什么
- ✅ 使用规范格式（feat/fix/docs等）
- ❌ 不要写"更新"、"修改"等模糊信息

### 3. 分支命名
- ✅ `feature/功能名称`
- ✅ `fix/bug描述`
- ✅ `hotfix/紧急修复`
- ❌ 不要用中文或特殊字符

### 4. 代码审查
- ✅ 所有代码都要经过PR
- ✅ 至少一人审查
- ✅ 通过测试后再合并

---

## 🚀 总结

使用Git/GitHub开发的主要优势：

1. **安全性** - 主代码受保护，在分支上开发
2. **可追溯** - 完整的代码历史记录
3. **可回退** - 随时回到任何版本
4. **协作性** - 多人同时开发不冲突
5. **质量保证** - 代码审查机制
6. **自动化** - CI/CD自动测试和部署

现在您可以：
- 安全地尝试新功能
- 与团队成员协作
- 追踪所有代码更改
- 保证代码质量

开始享受版本控制带来的便利吧！🎉
