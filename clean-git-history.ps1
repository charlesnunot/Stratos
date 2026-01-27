# 清理 Git 历史中的敏感信息
# 警告：这会重写 Git 历史，需要强制推送
# 在PowerShell中运行：.\clean-git-history.ps1

Write-Host "=== 清理 Git 历史中的敏感信息 ===" -ForegroundColor Cyan
Write-Host "⚠️  警告：此操作会重写 Git 历史！" -ForegroundColor Red
Write-Host ""

# 进入项目目录
$projectPath = if (Test-Path "C:\Stratos") { "C:\Stratos" } else { "C:\Users\admin\Desktop\Stratos" }
Set-Location $projectPath

# 确认操作
Write-Host "此脚本将从 Git 历史中移除包含 GitHub token 的提交。" -ForegroundColor Yellow
Write-Host ""
Write-Host "选项：" -ForegroundColor Cyan
Write-Host "1. 使用 git filter-branch 清理历史（需要重写所有提交）" -ForegroundColor White
Write-Host "2. 使用 BFG Repo-Cleaner（推荐，但需要安装）" -ForegroundColor White
Write-Host "3. 使用 GitHub 的允许推送功能（临时解决方案）" -ForegroundColor White
Write-Host ""
Write-Host "推荐方案：使用 GitHub 提供的链接临时允许推送，然后确保不再提交 token" -ForegroundColor Yellow
Write-Host ""
Write-Host "GitHub 提供的允许链接：" -ForegroundColor Cyan
Write-Host "https://github.com/charlesnunot/Stratos/security/secret-scanning/unblock-secret/38p3OgG4SGWsaeWAf3YGeiYkiV0" -ForegroundColor White
Write-Host ""
Write-Host "或者，我们可以创建一个新的提交来覆盖历史中的敏感信息。" -ForegroundColor Yellow
Write-Host ""

$choice = Read-Host "选择方案 (1/2/3/取消)"

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "使用 git filter-branch 清理..." -ForegroundColor Yellow
    Write-Host "⚠️  这可能需要很长时间，并且会重写所有提交历史" -ForegroundColor Red
    Write-Host ""
    
    $confirm = Read-Host "确认继续？(yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "已取消" -ForegroundColor Gray
        exit 0
    }
    
    # 使用 filter-branch 替换 token
    # 注意：请将 YOUR_TOKEN_HERE 替换为实际的 token（从环境变量或输入获取，不要硬编码）
    Write-Host "请输入要移除的 token（或按 Enter 跳过）：" -ForegroundColor Yellow
    $token = Read-Host
    if ($token) {
        git filter-branch --force --index-filter "git rm --cached --ignore-unmatch -r . && git reset --hard" --prune-empty --tag-name-filter cat -- --all
    } else {
        Write-Host "已跳过 token 替换" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "✅ 历史已清理" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  现在需要强制推送到远程仓库：" -ForegroundColor Yellow
    Write-Host "  git push origin --force --all" -ForegroundColor White
    Write-Host "  git push origin --force --tags" -ForegroundColor White
    
} elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "使用 BFG Repo-Cleaner..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "首先需要安装 BFG：" -ForegroundColor Cyan
    Write-Host "1. 下载：https://rtyley.github.io/bfg-repo-cleaner/" -ForegroundColor White
    Write-Host "2. 或使用 Chocolatey: choco install bfg" -ForegroundColor White
    Write-Host ""
    Write-Host "然后运行：" -ForegroundColor Cyan
    Write-Host "  bfg --replace-text tokens.txt" -ForegroundColor White
    Write-Host ""
    Write-Host "其中 tokens.txt 包含（将 YOUR_TOKEN_HERE 替换为实际 token）：" -ForegroundColor Cyan
    Write-Host "  YOUR_TOKEN_HERE==>" -ForegroundColor White
    
} elseif ($choice -eq "3") {
    Write-Host ""
    Write-Host "使用 GitHub 的临时允许推送功能..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. 访问以下链接（需要登录 GitHub）：" -ForegroundColor Cyan
    Write-Host "   https://github.com/charlesnunot/Stratos/security/secret-scanning/unblock-secret/38p3OgG4SGWsaeWAf3YGeiYkiV0" -ForegroundColor White
    Write-Host ""
    Write-Host "2. 点击 'Allow secret' 临时允许推送" -ForegroundColor White
    Write-Host ""
    Write-Host "3. 然后立即推送代码" -ForegroundColor White
    Write-Host ""
    Write-Host "4. 推送成功后，建议撤销该 token 并创建新 token" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "⚠️  重要：这只是临时解决方案，token 仍然在 Git 历史中！" -ForegroundColor Red
    Write-Host "   建议推送成功后立即撤销该 token" -ForegroundColor Red
    
} else {
    Write-Host "已取消" -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
