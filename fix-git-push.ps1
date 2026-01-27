# 修复 Git 推送网络问题
# 在PowerShell中运行：.\fix-git-push.ps1

Write-Host "=== 修复 Git 推送问题 ===" -ForegroundColor Cyan
Write-Host ""

# 进入项目目录
$projectPath = if (Test-Path "C:\Stratos") { "C:\Stratos" } else { "C:\Users\admin\Desktop\Stratos" }
Set-Location $projectPath

# 清除所有代理环境变量
Write-Host "清除代理设置..." -ForegroundColor Yellow
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null
[Environment]::SetEnvironmentVariable("HTTP_PROXY", $null, "Process")
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", $null, "Process")
[Environment]::SetEnvironmentVariable("http_proxy", $null, "Process")
[Environment]::SetEnvironmentVariable("https_proxy", $null, "Process")

# 清除 Git 代理配置
Write-Host "清除 Git 代理配置..." -ForegroundColor Yellow
git config --global --unset http.proxy 2>$null
git config --global --unset https.proxy 2>$null
git config --local --unset http.proxy 2>$null
git config --local --unset https.proxy 2>$null

# 测试 GitHub 连接
Write-Host ""
Write-Host "测试 GitHub 连接..." -ForegroundColor Yellow
$testResult = Test-NetConnection github.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($testResult) {
    Write-Host "✅ GitHub 连接正常" -ForegroundColor Green
} else {
    Write-Host "❌ 无法连接到 GitHub" -ForegroundColor Red
    Write-Host ""
    Write-Host "请检查：" -ForegroundColor Yellow
    Write-Host "1. 网络连接是否正常" -ForegroundColor White
    Write-Host "2. 防火墙设置" -ForegroundColor White
    Write-Host "3. 是否需要配置代理" -ForegroundColor White
    Write-Host ""
    exit 1
}

# 配置远程仓库（使用普通 URL，Git 会提示输入凭据）
Write-Host ""
Write-Host "配置远程仓库..." -ForegroundColor Yellow
git remote set-url origin https://github.com/charlesnunot/Stratos.git

# 显示状态
Write-Host ""
Write-Host "当前状态：" -ForegroundColor Cyan
git status --short
Write-Host ""
Write-Host "本地提交数：" -NoNewline
$localCommits = (git rev-list --count origin/main..HEAD 2>$null)
if ($localCommits) {
    Write-Host " $localCommits 个提交待推送" -ForegroundColor Yellow
} else {
    Write-Host " 已同步" -ForegroundColor Green
}

# 尝试推送
Write-Host ""
Write-Host "开始推送到 GitHub..." -ForegroundColor Yellow
Write-Host ""

# 使用无代理设置推送
$output = git -c http.proxy= -c https.proxy= push -u origin main 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ 推送成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "您的代码已同步到：https://github.com/charlesnunot/Stratos" -ForegroundColor Cyan
    Write-Host ""
    
    # 将远程URL改回普通格式
    Write-Host "正在将远程URL改回普通格式..." -ForegroundColor Yellow
    git remote set-url origin https://github.com/charlesnunot/Stratos.git
    Write-Host "✅ 已完成" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "下一步：在 Vercel 上部署" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. 访问 https://vercel.com 并登录" -ForegroundColor White
    Write-Host "2. 点击 'Add New Project'" -ForegroundColor White
    Write-Host "3. 导入 GitHub 仓库: charlesnunot/Stratos" -ForegroundColor White
    Write-Host "4. 配置环境变量（参考 VERCEL_DEPLOYMENT_GUIDE.md）" -ForegroundColor White
    Write-Host "5. 点击 'Deploy'" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ 推送失败" -ForegroundColor Red
    Write-Host ""
    Write-Host "错误信息：" -ForegroundColor Yellow
    Write-Host $output -ForegroundColor Red
    Write-Host ""
    
    # 提供替代方案
    Write-Host "替代方案：" -ForegroundColor Yellow
    Write-Host "1. 检查网络连接" -ForegroundColor White
    Write-Host "2. 尝试使用 SSH 连接（如果已配置 SSH 密钥）" -ForegroundColor White
    Write-Host "3. 手动在 GitHub 网站上创建文件" -ForegroundColor White
    Write-Host ""
    Write-Host "如果使用 SSH：" -ForegroundColor Yellow
    Write-Host "  git remote set-url origin git@github.com:charlesnunot/Stratos.git" -ForegroundColor Gray
    Write-Host "  git push -u origin main" -ForegroundColor Gray
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
