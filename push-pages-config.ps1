# 推送GitHub Pages配置脚本
Write-Host "=== 推送GitHub Pages配置 ===" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  注意：需要令牌具有 'workflow' 权限" -ForegroundColor Yellow
Write-Host "如果失败，请访问 https://github.com/settings/tokens 更新令牌权限" -ForegroundColor Yellow
Write-Host ""

Set-Location "C:\Users\admin\Desktop\Stratos"

# 清除代理
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""
$env:http_proxy = ""
$env:https_proxy = ""

# 设置包含令牌的URL
# 如果您的令牌已更新，请替换下面的令牌
git remote set-url origin https://charlesnunot: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@github.com/charlesnunot/Stratos.git

# 推送
Write-Host "正在推送配置..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ 推送成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步操作：" -ForegroundColor Cyan
    Write-Host "1. 访问：https://github.com/charlesnunot/Stratos/settings/pages" -ForegroundColor White
    Write-Host "2. 在 'Source' 下选择 'GitHub Actions'" -ForegroundColor White
    Write-Host "3. 保存设置" -ForegroundColor White
    Write-Host "4. 等待GitHub Actions自动部署（约5-10分钟）" -ForegroundColor White
    Write-Host ""
    Write-Host "查看部署状态：" -ForegroundColor Cyan
    Write-Host "https://github.com/charlesnunot/Stratos/actions" -ForegroundColor White
    Write-Host ""
    
    # 改回普通URL
    git remote set-url origin https://github.com/charlesnunot/Stratos.git
} else {
    Write-Host ""
    Write-Host "❌ 推送失败，请手动运行：" -ForegroundColor Red
    Write-Host "git push origin main" -ForegroundColor White
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
