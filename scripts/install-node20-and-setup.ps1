# 安装 Node.js 20 并设置项目的自动化脚本
# 注意：此脚本假设您已经手动安装了 Node.js 20 LTS

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Node.js 20 安装后设置脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js 版本
Write-Host "=== 检查 Node.js 版本 ===" -ForegroundColor Cyan
try {
    $nodeVersion = node -v
    Write-Host "当前 Node.js 版本: $nodeVersion" -ForegroundColor Yellow
    
    if ($nodeVersion -match "v22\.") {
        Write-Host ""
        Write-Host "❌ 错误: 当前仍在使用 Node.js 22.x" -ForegroundColor Red
        Write-Host ""
        Write-Host "请先完成以下步骤:" -ForegroundColor Yellow
        Write-Host "1. 访问 https://nodejs.org/" -ForegroundColor White
        Write-Host "2. 下载并安装 Node.js 20.x LTS" -ForegroundColor White
        Write-Host "3. 安装完成后，关闭并重新打开 PowerShell 终端" -ForegroundColor White
        Write-Host "4. 再次运行此脚本" -ForegroundColor White
        Write-Host ""
        exit 1
    } elseif ($nodeVersion -match "v20\.") {
        Write-Host "✓ Node.js 20 已安装" -ForegroundColor Green
    } elseif ($nodeVersion -match "v18\.") {
        Write-Host "✓ Node.js 18 已安装（兼容）" -ForegroundColor Green
    } else {
        Write-Host "⚠️  警告: 未知的 Node.js 版本" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ 无法获取 Node.js 版本: $_" -ForegroundColor Red
    Write-Host "请确保 Node.js 已正确安装并在 PATH 中" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 检查 npm 版本
Write-Host "=== 检查 npm 版本 ===" -ForegroundColor Cyan
try {
    $npmVersion = npm -v
    Write-Host "npm 版本: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ 无法获取 npm 版本" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 检查项目目录
Write-Host "=== 检查项目目录 ===" -ForegroundColor Cyan
$projectPath = "C:\Users\admin\Desktop\Stratos"
if (-not (Test-Path $projectPath)) {
    Write-Host "❌ 项目目录不存在: $projectPath" -ForegroundColor Red
    exit 1
}

Set-Location $projectPath
Write-Host "✓ 项目目录: $projectPath" -ForegroundColor Green

Write-Host ""

# 清理旧的构建缓存
Write-Host "=== 清理构建缓存 ===" -ForegroundColor Cyan
if (Test-Path .next) {
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    Write-Host "✓ 已清理 .next 目录" -ForegroundColor Green
} else {
    Write-Host "✓ .next 目录不存在，无需清理" -ForegroundColor Green
}

Write-Host ""

# 停止所有 Node.js 进程
Write-Host "=== 停止现有 Node.js 进程 ===" -ForegroundColor Cyan
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Stop-Process -Name node -Force -ErrorAction SilentlyContinue
    Write-Host "✓ 已停止 $($nodeProcesses.Count) 个 Node.js 进程" -ForegroundColor Green
} else {
    Write-Host "✓ 没有运行中的 Node.js 进程" -ForegroundColor Green
}

Write-Host ""

# 重新安装依赖
Write-Host "=== 重新安装项目依赖 ===" -ForegroundColor Cyan
Write-Host "这可能需要几分钟时间..." -ForegroundColor Yellow
Write-Host ""

try {
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ 依赖安装成功" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ 依赖安装失败" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ 依赖安装出错: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 验证安装
Write-Host "=== 验证安装 ===" -ForegroundColor Cyan
if (Test-Path node_modules) {
    $count = (Get-ChildItem node_modules -Directory -ErrorAction SilentlyContinue).Count
    Write-Host "✓ node_modules 存在，包含 $count 个包" -ForegroundColor Green
} else {
    Write-Host "❌ node_modules 不存在" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 启动开发服务器
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "准备启动开发服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "正在启动开发服务器..." -ForegroundColor Yellow
Write-Host ""

# 启动服务器（后台运行）
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; npm run dev" -WindowStyle Normal

Write-Host "✓ 开发服务器已在新的 PowerShell 窗口中启动" -ForegroundColor Green
Write-Host ""
Write-Host "请在新窗口中查看服务器状态" -ForegroundColor Yellow
Write-Host "如果看到 'Ready' 消息，说明服务器启动成功" -ForegroundColor Yellow
Write-Host "然后可以在浏览器中访问: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
