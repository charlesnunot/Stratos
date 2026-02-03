# 将 Downloads 中的 Stratos logo 复制到 public/logo.png
# 用法：在 PowerShell 中执行
#   cd c:\Stratos
#   .\scripts\copy-logo.ps1
# 若您的 logo 文件名不同，请修改下面 $source 或把文件路径作为参数传入。

$ErrorActionPreference = "Stop"
$downloads = [Environment]::GetFolderPath("UserProfile") + "\Downloads"
$dest = Join-Path $PSScriptRoot "..\public\logo.png"

# 可能的文件名（按优先级）
$candidates = @(
    "ChatGPT Image 2026年2月3日 14_06_15.png",
    "ChatGPT*.png"
)

$source = $null
foreach ($name in $candidates) {
    $path = Join-Path $downloads $name
    if (Test-Path $path) {
        $item = Get-Item $path
        if ($item -is [System.IO.DirectoryInfo]) { continue }
        $source = $item.FullName
        break
    }
}
if (-not $source) {
    $list = Get-ChildItem $downloads -Filter "*.png" | Select-Object -First 5 Name, LastWriteTime
    Write-Host "Logo file not found in Downloads."
    Write-Host "Recent PNG files:"
    $list | ForEach-Object { Write-Host "  $($_.Name)  $($_.LastWriteTime)" }
    Write-Host "Run with path: .\scripts\copy-logo.ps1 'C:\Users\admin\Downloads\yourfile.png'"
    exit 1
}

# 支持通过参数传入源路径
if ($args.Count -ge 1 -and (Test-Path $args[0])) {
    $source = (Resolve-Path $args[0]).Path
}

$destDir = Split-Path $dest -Parent
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
Copy-Item -LiteralPath $source -Destination $dest -Force
Write-Host "OK: Copied to $dest"
if (Test-Path $dest) {
    $len = (Get-Item $dest).Length
    Write-Host "    Size: $len bytes"
}
