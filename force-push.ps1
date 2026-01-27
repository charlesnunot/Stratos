# 强制推送脚本 - 覆盖远程仓库内容
# 警告：这将删除远程仓库的所有现有内容，用本地代码替换
# 在PowerShell中运行：.\force-push.ps1

Write-Host "=== 强制推送Stratos项目到GitHub ===" -ForegroundColor Yellow
Write-Host "⚠️  警告：这将覆盖远程仓库的所有内容！" -ForegroundColor Red
Write-Host ""

# 进入项目目录
Set-Location "C:\Users\admin\Desktop\Stratos"

# 清除所有代理环境变量
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null
[Environment]::SetEnvironmentVariable("HTTP_PROXY", $null, "Process")
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", $null, "Process")
[Environment]::SetEnvironmentVariable("http_proxy", $null, "Process")
[Environment]::SetEnvironmentVariable("https_proxy", $null, "Process")

# 设置包含令牌的远程URL
Write-Host "配置远程仓库..." -ForegroundColor Yellow
git remote set-url origin https://charlesnunot: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@github.com/charlesnunot/Stratos.git

# 清除本地凭据缓存
git config --local --unset credential.helper 2>$null
git config --local credential.helper ""

# 显示当前状态
Write-Host "当前分支: " -NoNewline
git branch --show-current
Write-Host "远程仓库: " -NoNewline
git remote get-url origin | ForEach-Object { $_ -replace 'ghp_[^@]+', 'ghp_***' }
Write-Host ""

# 先获取远程信息（不合并）
Write-Host "获取远程仓库信息..." -ForegroundColor Yellow
git -c http.proxy= -c https.proxy= fetch origin 2>&1 | Out-Null

# 强制推送（覆盖远程内容）
Write-Host "开始强制推送代码（将覆盖远程内容）..." -ForegroundColor Yellow
Write-Host ""

$output = git -c http.proxy= -c https.proxy= push -u origin main --force 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ 强制推送成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "您的代码已同步到：https://github.com/charlesnunot/Stratos" -ForegroundColor Cyan
    Write-Host "远程仓库内容已被本地代码覆盖" -ForegroundColor Yellow
    Write-Host ""
    
    # 推送成功后，将远程URL改回普通格式（安全考虑）
    Write-Host "正在将远程URL改回普通格式（安全考虑）..." -ForegroundColor Yellow
    git remote set-url origin https://github.com/charlesnunot/Stratos.git
    Write-Host "✅ 已完成" -ForegroundColor Green
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
    Write-Host ""
    Write-Host "请检查：" -ForegroundColor Yellow
    Write-Host "- 网络连接是否正常" -ForegroundColor White
    Write-Host "- 是否可以访问 https://github.com" -ForegroundColor White
    Write-Host "- 令牌是否有效（https://github.com/settings/tokens）" -ForegroundColor White
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
