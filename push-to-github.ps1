# GitHub推送脚本
# 使用方法：在PowerShell中运行此脚本

Write-Host "=== Stratos项目推送到GitHub ===" -ForegroundColor Green
Write-Host ""

# 进入项目目录
Set-Location "C:\Users\admin\Desktop\Stratos"

# 清除代理设置
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:http_proxy = ""
$env:https_proxy = ""

# 显示当前远程URL（不显示完整令牌）
Write-Host "当前远程仓库配置：" -ForegroundColor Yellow
git remote -v | ForEach-Object { $_ -replace 'ghp_[^@]+', 'ghp_***' }
Write-Host ""

# 尝试推送
Write-Host "开始推送代码到GitHub..." -ForegroundColor Yellow
Write-Host ""

try {
    git push -u origin main
    
    Write-Host ""
    Write-Host "✅ 推送成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "您的代码已同步到：https://github.com/charlesnunot/Stratos" -ForegroundColor Cyan
    Write-Host ""
    
    # 推送成功后，将远程URL改回普通格式（安全考虑）
    Write-Host "正在将远程URL改回普通格式（安全考虑）..." -ForegroundColor Yellow
    git remote set-url origin https://github.com/charlesnunot/Stratos.git
    Write-Host "✅ 已完成" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "❌ 推送失败" -ForegroundColor Red
    Write-Host ""
    Write-Host "如果提示需要输入凭据：" -ForegroundColor Yellow
    Write-Host "  Username: charlesnunot" -ForegroundColor White
    Write-Host "  Password: 您的个人访问令牌（从 https://github.com/settings/tokens 获取）" -ForegroundColor White
    Write-Host ""
    Write-Host "或者手动运行：" -ForegroundColor Yellow
    Write-Host "  git push -u origin main" -ForegroundColor White
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
