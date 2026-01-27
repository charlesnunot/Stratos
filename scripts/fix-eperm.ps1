# 修复 Next.js EPERM 错误的自动化脚本
# 用于解决 Windows 上 Next.js 开发服务器的 spawn EPERM 错误

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "修复 Next.js EPERM 错误" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js 版本
Write-Host "=== 检查 Node.js 版本 ===" -ForegroundColor Cyan
try {
    $nodeVersion = node -v
    Write-Host "当前 Node.js 版本: $nodeVersion" -ForegroundColor Green
    
    if ($nodeVersion -match "v22\.") {
        Write-Host "⚠️  警告: Node.js 22.x 与 Next.js 14.0.4 存在兼容性问题" -ForegroundColor Yellow
        Write-Host "   建议使用 Node.js 20 LTS" -ForegroundColor Yellow
    } elseif ($nodeVersion -match "v20\." -or $nodeVersion -match "v18\.") {
        Write-Host "✓ Node.js 版本兼容" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ 无法获取 Node.js 版本: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 步骤 1: 停止所有 Node.js 进程
Write-Host "=== 步骤 1: 停止所有 Node.js 进程 ===" -ForegroundColor Cyan
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Stop-Process -Name node -Force -ErrorAction SilentlyContinue
    Write-Host "✓ 已停止 $($nodeProcesses.Count) 个 Node.js 进程" -ForegroundColor Green
} else {
    Write-Host "✓ 没有运行中的 Node.js 进程" -ForegroundColor Green
}

Write-Host ""

# 步骤 2: 清理构建缓存
Write-Host "=== 步骤 2: 清理构建缓存 ===" -ForegroundColor Cyan
if (Test-Path .next) {
    Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
    Write-Host "✓ 已清理 .next 目录" -ForegroundColor Green
} else {
    Write-Host "✓ .next 目录不存在，无需清理" -ForegroundColor Green
}

Write-Host ""

# 步骤 3: 检查端口占用
Write-Host "=== 步骤 3: 检查端口占用 ===" -ForegroundColor Cyan
$port = netstat -ano | findstr :3000
if ($port) {
    Write-Host "⚠️  端口 3000 被占用" -ForegroundColor Yellow
    Write-Host "   可以使用以下命令停止占用端口的进程:" -ForegroundColor Yellow
    Write-Host "   netstat -ano | findstr :3000" -ForegroundColor Gray
} else {
    Write-Host "✓ 端口 3000 未被占用" -ForegroundColor Green
}

Write-Host ""

# 步骤 4: 检查项目目录权限
Write-Host "=== 步骤 4: 检查项目目录权限 ===" -ForegroundColor Cyan
$projectPath = Get-Location
try {
    $testFile = Join-Path $projectPath ".permission-test"
    "test" | Out-File -FilePath $testFile -ErrorAction Stop
    Remove-Item $testFile -ErrorAction SilentlyContinue
    Write-Host "✓ 项目目录具有写入权限" -ForegroundColor Green
} catch {
    Write-Host "❌ 项目目录可能没有写入权限: $_" -ForegroundColor Red
    Write-Host "   建议以管理员身份运行此脚本" -ForegroundColor Yellow
}

Write-Host ""

# 步骤 5: 验证 package.json 配置
Write-Host "=== 步骤 5: 验证 package.json 配置 ===" -ForegroundColor Cyan
if (Test-Path package.json) {
    $packageJson = Get-Content package.json | ConvertFrom-Json
    if ($packageJson.scripts.dev -match "NODE_OPTIONS") {
        Write-Host "✓ dev 脚本已配置 NODE_OPTIONS" -ForegroundColor Green
    } else {
        Write-Host "⚠️  dev 脚本未配置 NODE_OPTIONS" -ForegroundColor Yellow
        Write-Host "   建议运行此脚本后更新 package.json" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ package.json 不存在" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 步骤 6: 清理 npm 缓存（可选）
Write-Host "=== 步骤 6: 清理 npm 缓存（可选）===" -ForegroundColor Cyan
$cleanCache = Read-Host "是否清理 npm 缓存? (y/N)"
if ($cleanCache -eq "y" -or $cleanCache -eq "Y") {
    npm cache clean --force
    Write-Host "✓ npm 缓存已清理" -ForegroundColor Green
} else {
    Write-Host "跳过清理 npm 缓存" -ForegroundColor Gray
}

Write-Host ""

# 完成
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "修复步骤完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "现在可以尝试启动开发服务器:" -ForegroundColor Yellow
Write-Host "  npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果仍然遇到 EPERM 错误，请尝试以下解决方案:" -ForegroundColor Yellow
Write-Host ""
Write-Host "方案 1: 以管理员身份运行 PowerShell" -ForegroundColor Cyan
Write-Host "  1. 关闭当前 PowerShell" -ForegroundColor White
Write-Host "  2. 右键点击 PowerShell" -ForegroundColor White
Write-Host "  3. 选择 '以管理员身份运行'" -ForegroundColor White
Write-Host "  4. 重新运行 npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "方案 2: 检查 Windows Defender 或其他安全软件" -ForegroundColor Cyan
Write-Host "  - 临时禁用防病毒软件测试" -ForegroundColor White
Write-Host "  - 将项目目录添加到防病毒软件白名单" -ForegroundColor White
Write-Host ""
Write-Host "方案 3: 使用 WSL2 (Windows Subsystem for Linux)" -ForegroundColor Cyan
Write-Host "  - 在 WSL2 中运行开发服务器可以避免 Windows 权限问题" -ForegroundColor White
Write-Host ""
Write-Host "方案 4: 升级 Next.js 版本" -ForegroundColor Cyan
Write-Host "  - 尝试升级到 Next.js 14.1.0 或更高版本" -ForegroundColor White
Write-Host "  - 运行: npm install next@latest" -ForegroundColor White
Write-Host ""
Write-Host "方案 5: 检查 Node.js 安装" -ForegroundColor Cyan
Write-Host "  - 确认 Node.js 20.16.0 或更高版本" -ForegroundColor White
Write-Host "  - 重新安装 Node.js 20 LTS" -ForegroundColor White
Write-Host ""
