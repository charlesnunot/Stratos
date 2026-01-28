# 更新 GitHub Token 并推送代码
# 使用方法：在PowerShell中运行此脚本

Write-Host "=== 更新 GitHub Token 并推送代码 ===" -ForegroundColor Green
Write-Host ""

# 进入项目目录
Set-Location "C:\Stratos"

# 检查是否有待推送的提交
Write-Host "检查待推送的提交..." -ForegroundColor Yellow
$localCommits = (git rev-list --count origin/main..HEAD 2>$null)
if ($localCommits) {
    Write-Host "发现 $localCommits 个本地提交待推送" -ForegroundColor Cyan
} else {
    Write-Host "没有待推送的提交" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "请按照以下步骤操作：" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. 获取新的 GitHub Personal Access Token：" -ForegroundColor White
Write-Host "   - 访问：https://github.com/settings/tokens" -ForegroundColor Gray
Write-Host "   - 点击 'Generate new token' → 'Generate new token (classic)'" -ForegroundColor Gray
Write-Host "   - Note: Stratos Git Push" -ForegroundColor Gray
Write-Host "   - Expiration: 90 days (或自定义)" -ForegroundColor Gray
Write-Host "   - Scopes: ✅ repo (必须勾选)" -ForegroundColor Gray
Write-Host "   - 点击 'Generate token'" -ForegroundColor Gray
Write-Host "   - ⚠️ 立即复制并保存 token（格式：ghp_xxxxxxxxxxxx）" -ForegroundColor Red
Write-Host ""

# 提示用户输入 token
$token = Read-Host "2. 请输入新的 GitHub Personal Access Token"

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host ""
    Write-Host "❌ Token 不能为空" -ForegroundColor Red
    exit 1
}

# 验证 token 格式
if (-not $token.StartsWith("ghp_")) {
    Write-Host ""
    Write-Host "⚠️ 警告：Token 格式可能不正确（应以 'ghp_' 开头）" -ForegroundColor Yellow
    $continue = Read-Host "是否继续？(y/n)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# 更新远程 URL（包含新 token）
Write-Host ""
Write-Host "正在更新远程仓库 URL..." -ForegroundColor Yellow
$remoteUrl = "https://charlesnunot:$token@github.com/charlesnunot/Stratos.git"
git remote set-url origin $remoteUrl

# 验证远程 URL 已更新（隐藏 token）
Write-Host "✅ 远程 URL 已更新" -ForegroundColor Green
Write-Host ""

# 尝试推送
Write-Host "开始推送代码到 GitHub..." -ForegroundColor Yellow
Write-Host ""

try {
    $output = git push -u origin main 2>&1
    
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
        Write-Host "提示：下次推送时，Git 会提示输入凭据，使用您的 token 作为密码" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "❌ 推送失败" -ForegroundColor Red
        Write-Host ""
        Write-Host "错误信息：" -ForegroundColor Yellow
        Write-Host $output -ForegroundColor Red
        Write-Host ""
        Write-Host "可能的原因：" -ForegroundColor Yellow
        Write-Host "1. Token 无效或已过期" -ForegroundColor White
        Write-Host "2. Token 权限不足（需要 'repo' 权限）" -ForegroundColor White
        Write-Host "3. 网络连接问题" -ForegroundColor White
        Write-Host ""
        Write-Host "请检查：" -ForegroundColor Yellow
        Write-Host "- Token 是否正确复制（包括 'ghp_' 前缀）" -ForegroundColor White
        Write-Host "- Token 是否已勾选 'repo' 权限" -ForegroundColor White
        Write-Host "- Token 是否已过期" -ForegroundColor White
        Write-Host ""
        
        # 将远程URL改回普通格式
        git remote set-url origin https://github.com/charlesnunot/Stratos.git
    }
} catch {
    Write-Host ""
    Write-Host "❌ 推送过程中发生错误" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    
    # 将远程URL改回普通格式
    git remote set-url origin https://github.com/charlesnunot/Stratos.git
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
