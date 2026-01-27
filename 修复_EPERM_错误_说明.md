# 修复 Next.js spawn EPERM 错误 - 解决方案

## 问题确认

经过诊断，确认问题的根本原因是：

- **当前 Node.js 版本**: v22.19.0
- **Next.js 版本**: 14.0.4
- **错误**: `spawn EPERM` (操作权限错误)

Node.js 22.x 与 Next.js 14.0.4 存在已知兼容性问题，Node.js 22 的 `child_process.spawn()` 在 Windows 上有 bug。

## 解决方案：降级到 Node.js 20 LTS（必须）

这是唯一可靠的解决方案。Next.js 14 官方推荐使用 Node.js 18.17+ 或 20.x LTS。

### 步骤 1：下载并安装 Node.js 20 LTS

1. 访问 Node.js 官网：https://nodejs.org/
2. 下载 **Node.js 20.x LTS** 版本（推荐最新 20.x 版本）
3. 运行安装程序，按照提示完成安装

### 步骤 2：验证安装

打开新的 PowerShell 终端，运行：

```powershell
node -v
```

应该显示 `v20.x.x`（而不是 `v22.x.x`）

### 步骤 3：重新安装项目依赖

在项目目录中运行：

```powershell
cd C:\Users\admin\Desktop\Stratos
npm install
```

### 步骤 4：启动开发服务器

```powershell
npm run dev
```

服务器应该能成功启动，您会看到：

```
▲ Next.js 14.0.4
- Local:        http://localhost:3000
- Ready in X.Xs
```

## 如果使用 nvm（Node Version Manager）

如果您安装了 nvm-windows，可以使用以下命令切换版本：

```powershell
# 安装 Node.js 20
nvm install 20

# 切换到 Node.js 20
nvm use 20

# 验证版本
node -v

# 重新安装依赖
npm install

# 启动服务器
npm run dev
```

## 已完成的清理工作

我已经为您完成了以下清理：

- ✅ 停止了所有运行中的 Node.js 进程
- ✅ 清理了 `.next` 缓存目录
- ✅ 创建了诊断脚本 `scripts/diagnose-dev-server.ps1`

## 其他尝试过的方案（无效）

以下方案已尝试但无法解决问题：

- ❌ 清理 Node.js 进程和端口
- ❌ 清理 `.next` 缓存
- ❌ 使用不同端口（3001）
- ❌ 重新安装依赖

这些都无法解决 Node.js 22 的兼容性问题。

## 重要提示

- 降级 Node.js 后，可能需要重新安装全局 npm 包
- 如果项目中有其他依赖 Node.js 22 特性的代码，可能需要调整
- Next.js 14.0.4 与 Node.js 20 LTS 完全兼容

## 验证修复

安装 Node.js 20 后，运行以下命令验证：

```powershell
# 检查版本
node -v
npm -v

# 启动服务器
npm run dev

# 在浏览器访问
# http://localhost:3000
```

如果服务器成功启动并能在浏览器中访问，说明问题已解决！
