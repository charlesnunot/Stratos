# Stratos project cleanup script
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\clean.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\clean.ps1 -All
#   powershell -ExecutionPolicy Bypass -File .\scripts\clean.ps1 -NextOnly
#   powershell -ExecutionPolicy Bypass -File .\scripts\clean.ps1 -NodeModulesOnly

[CmdletBinding()]
param(
  [switch]$All,
  [switch]$NextOnly,
  [switch]$NodeModulesOnly,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Format-Bytes([long]$Bytes) {
  if ($Bytes -lt 1024) { return "$Bytes B" }
  if ($Bytes -lt 1024 * 1024) { return ("{0:N2} KB" -f ($Bytes / 1KB)) }
  if ($Bytes -lt 1024 * 1024 * 1024) { return ("{0:N2} MB" -f ($Bytes / 1MB)) }
  return ("{0:N2} GB" -f ($Bytes / 1GB))
}

function Get-DirSizeBytes([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  $sum = 0L
  try {
    Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
      ForEach-Object { $sum += $_.Length }
  } catch {
    # Ignore access errors
  }
  return $sum
}

function Remove-DirectorySafe([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "${Name}: not found, skipping" -ForegroundColor Gray
    return 0
  }
  
  $sizeBefore = Get-DirSizeBytes $Path
  Write-Host "Removing ${Name}... ($(Format-Bytes $sizeBefore))" -ForegroundColor Yellow
  
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    Write-Host "${Name}: removed successfully" -ForegroundColor Green
    return $sizeBefore
  } catch {
    Write-Host "${Name}: failed to remove - $($_.Exception.Message)" -ForegroundColor Red
    return 0
  }
}

function Remove-FileSafe([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return 0
  }
  
  try {
    $file = Get-Item -LiteralPath $Path
    $size = $file.Length
    Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
    Write-Host "${Name}: removed ($(Format-Bytes $size))" -ForegroundColor Green
    return $size
  } catch {
    Write-Host "${Name}: failed to remove - $($_.Exception.Message)" -ForegroundColor Red
    return 0
  }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $RepoRoot
try {
  Write-Host "Stratos Project Cleanup" -ForegroundColor Cyan
  Write-Host "Repository: $RepoRoot" -ForegroundColor Gray
  Write-Host ""
  
  # Determine what to clean
  $cleanNext = $false
  $cleanNodeModules = $false
  $cleanOther = $false
  
  if ($All) {
    $cleanNext = $true
    $cleanNodeModules = $true
    $cleanOther = $true
  } elseif ($NextOnly) {
    $cleanNext = $true
  } elseif ($NodeModulesOnly) {
    $cleanNodeModules = $true
  } else {
    # Default: clean .next and other temp files, but not node_modules
    $cleanNext = $true
    $cleanOther = $true
  }
  
  # Show what will be cleaned
  Write-Host "Cleanup plan:" -ForegroundColor Cyan
  if ($cleanNext) { Write-Host "  - .next (build cache)" -ForegroundColor Yellow }
  if ($cleanNodeModules) { Write-Host "  - node_modules (dependencies)" -ForegroundColor Yellow }
  if ($cleanOther) { Write-Host "  - Temporary files and logs" -ForegroundColor Yellow }
  Write-Host ""
  
  # Confirmation
  if (-not $Force) {
    $confirm = Read-Host "Continue? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
      Write-Host "Cancelled." -ForegroundColor Gray
      exit 0
    }
  }
  
  Write-Host ""
  $totalFreed = 0L
  
  # Clean .next
  if ($cleanNext) {
    $nextPath = Join-Path $RepoRoot ".next"
    $freed = Remove-DirectorySafe $nextPath ".next"
    $totalFreed += $freed
  }
  
  # Clean node_modules
  if ($cleanNodeModules) {
    $nodeModulesPath = Join-Path $RepoRoot "node_modules"
    $freed = Remove-DirectorySafe $nodeModulesPath "node_modules"
    $totalFreed += $freed
  }
  
  # Clean other temporary files
  if ($cleanOther) {
    Write-Host ""
    Write-Host "Cleaning temporary files..." -ForegroundColor Cyan
    
    # Log files
    $logPatterns = @("*.log", "npm-debug.log*", "yarn-debug.log*", "yarn-error.log*")
    foreach ($pattern in $logPatterns) {
      Get-ChildItem -Path $RepoRoot -Filter $pattern -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $freed = Remove-FileSafe $_.FullName $_.Name
        $totalFreed += $freed
      }
    }
    
    # TypeScript build info
    $tsBuildInfo = Join-Path $RepoRoot "*.tsbuildinfo"
    Get-ChildItem -Path $tsBuildInfo -Force -ErrorAction SilentlyContinue | ForEach-Object {
      $freed = Remove-FileSafe $_.FullName $_.Name
      $totalFreed += $freed
    }
    
    # Coverage directory
    $coveragePath = Join-Path $RepoRoot "coverage"
    if (Test-Path -LiteralPath $coveragePath) {
      $freed = Remove-DirectorySafe $coveragePath "coverage"
      $totalFreed += $freed
    }
    
    # Out directory
    $outPath = Join-Path $RepoRoot "out"
    if (Test-Path -LiteralPath $outPath) {
      $freed = Remove-DirectorySafe $outPath "out"
      $totalFreed += $freed
    }
    
    # Build directory
    $buildPath = Join-Path $RepoRoot "build"
    if (Test-Path -LiteralPath $buildPath) {
      $freed = Remove-DirectorySafe $buildPath "build"
      $totalFreed += $freed
    }
  }
  
  # Summary
  Write-Host ""
  Write-Host "=== Cleanup Summary ===" -ForegroundColor Cyan
  Write-Host "Total space freed: $(Format-Bytes $totalFreed)" -ForegroundColor Green
  
  if ($cleanNodeModules) {
    Write-Host ""
    Write-Host "Note: node_modules was removed. Run 'npm install' to restore dependencies." -ForegroundColor Yellow
  }
  
  if ($cleanNext) {
    Write-Host ""
    Write-Host "Note: .next was removed. Run 'npm run build' or 'npm run dev' to rebuild." -ForegroundColor Yellow
  }
  
} finally {
  Pop-Location
}
