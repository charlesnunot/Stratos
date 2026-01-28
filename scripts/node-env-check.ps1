# Node 环境自检脚本 - 一次跑完，排查 Cursor/Windows 下的 Node 路径问题
# 用法：在 PowerShell 里执行 .\scripts\node-env-check.ps1

Write-Host "`n=== Node 环境自检 ===" -ForegroundColor Cyan

# 1. 当前 node 位置
Write-Host "`n[1] 当前 node 命令解析结果:" -ForegroundColor Yellow
try {
    $nodeSrc = (Get-Command node -ErrorAction Stop).Source
    Write-Host "    (Get-Command node).Source = $nodeSrc" -ForegroundColor Green
} catch {
    Write-Host "    未找到 node 命令" -ForegroundColor Red
    $nodeSrc = $null
}

# 2. where node
Write-Host "`n[2] where node 全部命中:" -ForegroundColor Yellow
$whereNode = (where.exe node 2>$null)
if ($whereNode) { $whereNode | ForEach-Object { Write-Host "    $_" } } else { Write-Host "    (无)" -ForegroundColor Red }

# 3. node -v / npm -v
Write-Host "`n[3] 版本:" -ForegroundColor Yellow
try {
    $nv = node -v 2>$null; $npmv = npm -v 2>$null
    Write-Host "    node: $nv   npm: $npmv" -ForegroundColor Green
} catch {
    Write-Host "    执行 node/npm 失败" -ForegroundColor Red
}

# 4. PATH 里和 Node 相关的路径（靠前的几条）
Write-Host "`n[4] PATH 中与 node/npm/fnm/nvm 相关的条目（前 15 条）:" -ForegroundColor Yellow
$pathEntries = $env:PATH -split ';'
$relevant = $pathEntries | Where-Object { $_ -match 'node|npm|fnm|nvm|Program Files\\nodejs' } | Select-Object -First 15
$i = 0
foreach ($p in $relevant) {
    $i++
    Write-Host "    $i. $p"
}

# 5. 常见“真实 Node”路径是否存在
Write-Host "`n[5] 常见 Node 安装路径是否存在:" -ForegroundColor Yellow
$candidates = @(
    "C:\Program Files\nodejs\node.exe",
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\node\node.exe",
    "$env:APPDATA\npm\node.exe"
)
foreach ($c in $candidates) {
    $exist = Test-Path $c
    if ($exist) {
        $status = "存在"
        $color = "Green"
    } else {
        $status = "不存在"
        $color = "Gray"
    }
    Write-Host "    $c  → $status" -ForegroundColor $color
}

# 6. 建议
Write-Host "`n[6] 建议:" -ForegroundColor Cyan
if ($nodeSrc) {
    $dir = Split-Path $nodeSrc -Parent
    Write-Host "    当前 node 目录: $dir" -ForegroundColor White
    Write-Host "    若 Cursor 里 npm/节点异常，可尝试：" -ForegroundColor White
    Write-Host "    \$env:PATH = `"$dir;`$env:PATH`"" -ForegroundColor Cyan
    Write-Host "    然后执行: npm install" -ForegroundColor White
}
Write-Host "`n=== 自检结束 ===`n" -ForegroundColor Cyan
