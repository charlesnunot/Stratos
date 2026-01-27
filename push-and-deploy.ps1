# 推送项目到 GitHub 并准备 Vercel 部署
# 在PowerShell中运行：.\push-and-deploy.ps1

Write-Host "=== 推送 Stratos 项目到 GitHub ===" -ForegroundColor Cyan
Write-Host ""

# 进入项目目录（根据实际路径调整）
$projectPath = if (Test-Path "C:\Stratos") { "C:\Stratos" } else { "C:\Users\admin\Desktop\Stratos" }
Set-Location $projectPath

# 清除所有代理环境变量
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null
[Environment]::SetEnvironmentVariable("HTTP_PROXY", $null, "Process")
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", $null, "Process")
[Environment]::SetEnvironmentVariable("http_proxy", $null, "Process")
[Environment]::SetEnvironmentVariable("https_proxy", $null, "Process")

# 配置远程仓库（使用普通 URL，Git 会提示输入凭据）
Write-Host "配置远程仓库..." -ForegroundColor Yellow
git remote set-url origin https://github.com/charlesnunot/Stratos.git

# 清除本地凭据缓存
git config --local --unset credential.helper 2>$null
git config --local credential.helper ""

# 显示当前状态
Write-Host ""
Write-Host "当前分支: " -NoNewline
git branch --show-current
Write-Host "远程仓库: " -NoNewline
git remote get-url origin | ForEach-Object { $_ -replace 'ghp_[^@]+', 'ghp_***' }
Write-Host ""

# 检查是否有未提交的更改
$status = git status --porcelain
if ($status) {
    Write-Host "检测到未提交的更改，正在添加所有文件..." -ForegroundColor Yellow
    git add .
    
    Write-Host "请输入提交信息（或按回车使用默认信息）:" -ForegroundColor Yellow
    $commitMessage = Read-Host
    if ([string]::IsNullOrWhiteSpace($commitMessage)) {
        $commitMessage = "Update project files"
    }
    
    git commit -m $commitMessage
    Write-Host "✅ 文件已提交" -ForegroundColor Green
} else {
    Write-Host "没有未提交的更改" -ForegroundColor Gray
}

# 获取远程信息
Write-Host ""
Write-Host "获取远程仓库信息..." -ForegroundColor Yellow
git -c http.proxy= -c https.proxy= fetch origin 2>&1 | Out-Null

# 推送到 GitHub
Write-Host ""
Write-Host "开始推送到 GitHub..." -ForegroundColor Yellow
$output = git -c http.proxy= -c https.proxy= push -u origin main 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ 推送成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "您的代码已同步到：https://github.com/charlesnunot/Stratos" -ForegroundColor Cyan
    Write-Host ""
    
    # 推送成功后，将远程URL改回普通格式（安全考虑）
    Write-Host "正在将远程URL改回普通格式（安全考虑）..." -ForegroundColor Yellow
    git remote set-url origin https://github.com/charlesnunot/Stratos.git
    Write-Host "✅ 已完成" -ForegroundColor Green
    Write-Host ""
    
    # Vercel 部署说明
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Vercel 部署步骤" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "方法 1: 通过 Vercel 网站部署（推荐）" -ForegroundColor Yellow
    Write-Host "1. 访问 https://vercel.com 并登录" -ForegroundColor White
    Write-Host "2. 点击 'Add New Project'" -ForegroundColor White
    Write-Host "3. 导入 GitHub 仓库: charlesnunot/Stratos" -ForegroundColor White
    Write-Host "4. 配置环境变量（从 .env.example 文件）" -ForegroundColor White
    Write-Host "5. 点击 'Deploy'" -ForegroundColor White
    Write-Host ""
    Write-Host "方法 2: 通过 Vercel CLI 部署" -ForegroundColor Yellow
    Write-Host "1. 安装 Vercel CLI: npm i -g vercel" -ForegroundColor White
    Write-Host "2. 运行: vercel" -ForegroundColor White
    Write-Host "3. 按照提示完成部署" -ForegroundColor White
    Write-Host ""
    Write-Host "必需的环境变量（在 Vercel 项目设置中配置）:" -ForegroundColor Yellow
    Write-Host "- NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor White
    Write-Host "- NEXT_PUBLIC_SUPABASE_ANON_KEY" -ForegroundColor White
    Write-Host "- SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor White
    Write-Host "- STRIPE_SECRET_KEY (如果使用 Stripe)" -ForegroundColor White
    Write-Host "- STRIPE_WEBHOOK_SECRET (如果使用 Stripe)" -ForegroundColor White
    Write-Host "- CRON_SECRET (用于定时任务)" -ForegroundColor White
    Write-Host "- NEXT_PUBLIC_APP_URL (生产环境 URL)" -ForegroundColor White
    Write-Host ""
    Write-Host "提示：建议配置Git凭据管理器以保存凭据" -ForegroundColor Yellow
    Write-Host "  运行: git config --global credential.helper manager-core" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "❌ 推送失败" -ForegroundColor Red
    Write-Host ""
    Write-Host "错误信息：" -ForegroundColor Yellow
    Write-Host $output -ForegroundColor Red
    Write-Host ""
    Write-Host "可能的原因：" -ForegroundColor Yellow
    Write-Host "1. 网络连接问题" -ForegroundColor White
    Write-Host "2. 代理设置问题" -ForegroundColor White
    Write-Host "3. 令牌权限问题" -ForegroundColor White
    Write-Host "4. 远程分支冲突（需要先 pull）" -ForegroundColor White
    Write-Host ""
    Write-Host "如果遇到冲突，可以运行:" -ForegroundColor Yellow
    Write-Host "  git pull origin main --rebase" -ForegroundColor Gray
    Write-Host "  然后再次运行此脚本" -ForegroundColor Gray
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
