# 诊断 Next.js 开发服务器启动问题
# 用于检查 Node.js 版本、端口占用、进程状态等

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next.js 开发服务器诊断工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js 版本
Write-Host "=== Node.js 版本 ===" -ForegroundColor Cyan
try {
    $nodeVersion = node -v
    $npmVersion = npm -v
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "npm: $npmVersion" -ForegroundColor Green
    
    # 检查版本是否兼容
    if ($nodeVersion -match "v22\.") {
        Write-Host "⚠️  警告: Node.js 22.x 与 Next.js 14.0.4 存在兼容性问题" -ForegroundColor Yellow
        Write-Host "   建议降级到 Node.js 20 LTS" -ForegroundColor Yellow
    } elseif ($nodeVersion -match "v20\." -or $nodeVersion -match "v18\.") {
        Write-Host "✓ Node.js 版本兼容" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ 无法获取 Node.js 版本: $_" -ForegroundColor Red
}

Write-Host ""

# 检查端口占用
Write-Host "=== 检查 3000 端口占用 ===" -ForegroundColor Cyan
try {
    $port = netstat -ano | findstr :3000
    if ($port) {
        Write-Host "端口 3000 被占用：" -ForegroundColor Yellow
        $port | ForEach-Object { Write-Host $_ }
        
        # 提取 PID
        $pids = $port | ForEach-Object {
            if ($_ -match '\s+(\d+)$') {
                $matches[1]
            }
        } | Select-Object -Unique
        
        if ($pids) {
            Write-Host "`n占用端口的进程 ID: $($pids -join ', ')" -ForegroundColor Yellow
            Write-Host "可以使用以下命令停止进程:" -ForegroundColor Yellow
            $pids | ForEach-Object {
                Write-Host "  Stop-Process -Id $_ -Force" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "✓ 端口 3000 未被占用" -ForegroundColor Green
    }
} catch {
    Write-Host "无法检查端口占用: $_" -ForegroundColor Yellow
}

Write-Host ""

# 检查 Node 进程
Write-Host "=== 检查 Node.js 进程 ===" -ForegroundColor Cyan
try {
    $nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Host "发现 $($nodeProcesses.Count) 个 Node.js 进程：" -ForegroundColor Yellow
        $nodeProcesses | Format-Table Id, ProcessName, StartTime -AutoSize
        
        Write-Host "可以使用以下命令停止所有 Node.js 进程:" -ForegroundColor Yellow
        Write-Host "  Stop-Process -Name node -Force -ErrorAction SilentlyContinue" -ForegroundColor Gray
    } else {
        Write-Host "✓ 没有运行中的 Node.js 进程" -ForegroundColor Green
    }
} catch {
    Write-Host "无法检查 Node.js 进程: $_" -ForegroundColor Yellow
}

Write-Host ""

# 检查 .next 目录
Write-Host "=== 检查 .next 目录 ===" -ForegroundColor Cyan
if (Test-Path .next) {
    $nextSize = (Get-ChildItem .next -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host ".next 目录存在 (大小: $([math]::Round($nextSize, 2)) MB)" -ForegroundColor Yellow
    Write-Host "可以使用以下命令清理:" -ForegroundColor Yellow
    Write-Host "  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue" -ForegroundColor Gray
} else {
    Write-Host "✓ .next 目录不存在" -ForegroundColor Green
}

Write-Host ""

# 检查 node_modules
Write-Host "=== 检查 node_modules ===" -ForegroundColor Cyan
if (Test-Path node_modules) {
    try {
        $count = (Get-ChildItem node_modules -Directory -ErrorAction SilentlyContinue).Count
        Write-Host "✓ node_modules 存在，包含 $count 个包" -ForegroundColor Green
    } catch {
        Write-Host "node_modules 存在但无法统计" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ node_modules 不存在，需要运行 npm install" -ForegroundColor Red
}

Write-Host ""

# 检查 package.json
Write-Host "=== 检查项目配置 ===" -ForegroundColor Cyan
if (Test-Path package.json) {
    Write-Host "✓ package.json 存在" -ForegroundColor Green
    try {
        $packageJson = Get-Content package.json | ConvertFrom-Json
        if ($packageJson.dependencies.next) {
            Write-Host "Next.js 版本: $($packageJson.dependencies.next)" -ForegroundColor Green
        }
    } catch {
        Write-Host "无法解析 package.json" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ package.json 不存在" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "诊断完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
