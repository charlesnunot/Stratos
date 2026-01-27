# 切换到 Node.js 18 LTS - 快速指南

## 当前状态
- ❌ Node.js: v22.19.0（不兼容）
- ✅ 目标: Node.js 18.20.x LTS

## 步骤 1：卸载 Node.js 22

### 方法 A：通过控制面板（推荐）

1. 按 `Win + R`，输入 `appwiz.cpl`，回车
2. 在"程序和功能"中找到 **Node.js**
3. 右键点击 → **卸载**
4. 按照卸载向导完成卸载

### 方法 B：通过 PowerShell（快速）

```powershell
# 查找 Node.js 安装程序
Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -like "*Node*" } | ForEach-Object { $_.Uninstall() }
```

## 步骤 2：下载并安装 Node.js 18 LTS

1. **访问下载页面**
   - 直接下载：https://nodejs.org/dist/v18.20.4/node-v18.20.4-x64.msi
   - 或访问：https://nodejs.org/ → 选择 **18.x LTS** 版本

2. **运行安装程序**
   - 双击下载的 `.msi` 文件
   - 使用**默认设置**（全部勾选）
   - 点击"安装"完成安装

3. **重要**：安装完成后
   - **关闭所有 PowerShell/终端窗口**
   - **关闭 Cursor**
   - **重新打开 Cursor**

## 步骤 3：验证安装

在新的终端中运行：

```powershell
node -v
# 应该显示: v18.20.4 或类似的 v18.x.x

npm -v
# 应该显示: 9.x.x 或 10.x.x
```

## 步骤 4：启动开发服务器

```powershell
cd C:\Users\admin\Desktop\Stratos
npm run dev
```

应该看到：
```
▲ Next.js 14.0.4
- Local:        http://localhost:3000
- Ready in X.Xs
```

## 如果遇到问题

### 问题：卸载后仍有旧版本

1. 检查 PATH 环境变量：
   ```powershell
   $env:Path -split ';' | Where-Object { $_ -like '*node*' }
   ```

2. 手动删除残留：
   - 删除 `C:\Program Files\nodejs\`（如果存在）
   - 删除 `C:\Users\admin\AppData\Roaming\npm\`（如果存在）

3. 重启计算机

### 问题：安装后仍显示旧版本

1. **完全关闭 Cursor**
2. **重新打开 Cursor**
3. 在新终端运行 `node -v`

如果还是旧版本，可能需要：
- 重启计算机
- 检查是否有多个 Node.js 安装

## 快速命令（安装后）

```powershell
# 验证版本
node -v
npm -v

# 进入项目
cd C:\Users\admin\Desktop\Stratos

# 清理并启动
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```
