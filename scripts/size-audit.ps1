# Stratos repo size audit script
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\size-audit.ps1
# Optional:
#   powershell -ExecutionPolicy Bypass -File .\scripts\size-audit.ps1 -TopN 25
#   powershell -ExecutionPolicy Bypass -File .\scripts\size-audit.ps1 -IncludeGitHistory

[CmdletBinding()]
param(
  [int]$TopN = 15,
  [switch]$IncludeGitHistory
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
    # -Force includes hidden items (like .next)
    Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
      ForEach-Object { $sum += $_.Length }
  } catch {
    # Ignore access errors; return what we got
  }
  return $sum
}

function Invoke-Git([string[]]$Args) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) { throw "git not found. Please install Git and ensure it is on PATH." }
  & git @Args
}

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor Cyan
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $RepoRoot
try {
  Write-Host "Repo: $RepoRoot"

  Write-Section "Workspace size (top-level items)"
  $items = Get-ChildItem -LiteralPath $RepoRoot -Force -ErrorAction SilentlyContinue
  $sizes =
    foreach ($it in $items) {
      $bytes =
        if ($it.PSIsContainer) { Get-DirSizeBytes $it.FullName }
        else { [long]$it.Length }
      [pscustomobject]@{
        Name  = $it.Name
        Type  = if ($it.PSIsContainer) { "dir" } else { "file" }
        Bytes = $bytes
        Size  = Format-Bytes $bytes
        Path  = $it.FullName
      }
    }
  $sizes | Sort-Object Bytes -Descending | Select-Object -First $TopN Name, Type, Size, Path | Format-Table -AutoSize

  Write-Section "Key directories (node_modules / .next / .git)"
  $focus = @("node_modules", ".next", ".git", "out", "build", "dist", "public")
  $cleanableSizes = @{}
  foreach ($name in $focus) {
    $p = Join-Path $RepoRoot $name
    if (Test-Path -LiteralPath $p) {
      $b = if ((Get-Item -LiteralPath $p).PSIsContainer) { Get-DirSizeBytes $p } else { (Get-Item -LiteralPath $p).Length }
      Write-Host ("{0,-14} {1,10}  {2}" -f $name, (Format-Bytes $b), $p)
      if ($name -in @("node_modules", ".next", "out", "build", "coverage")) {
        $cleanableSizes[$name] = $b
      }
    } else {
      Write-Host ("{0,-14} {1}" -f $name, "(not found)")
    }
  }
  
  # Cleanup recommendations
  if ($cleanableSizes.Count -gt 0) {
    Write-Section "Cleanup recommendations"
    $totalCleanable = 0L
    foreach ($item in $cleanableSizes.GetEnumerator()) {
      $totalCleanable += $item.Value
      Write-Host ("  {0,-14} {1,10} - Can be safely removed" -f $item.Key, (Format-Bytes $item.Value)) -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host ("Total cleanable: {0}" -f (Format-Bytes $totalCleanable)) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To clean:" -ForegroundColor Green
    Write-Host "  npm run clean        - Remove .next and temp files (~280MB)" -ForegroundColor Gray
    Write-Host "  npm run clean:all    - Remove everything including node_modules (~644MB)" -ForegroundColor Gray
    Write-Host ""
  }

  $isGitRepo = Test-Path -LiteralPath (Join-Path $RepoRoot ".git")
  if ($isGitRepo) {
    Write-Section "Git tracking check (node_modules/.next)"
    $tracked = Invoke-Git @("ls-files")
    $bad = $tracked | Where-Object { $_ -match '^(node_modules|\.next)/' }
    if ($bad -and $bad.Count -gt 0) {
      Write-Host "Found paths tracked by Git (showing first $TopN):" -ForegroundColor Yellow
      $bad | Select-Object -First $TopN | ForEach-Object { Write-Host "  $_" }
      Write-Host ""
      Write-Host "Fix (untrack only; keep local files):" -ForegroundColor Yellow
      Write-Host "  git rm -r --cached node_modules"
      Write-Host "  git rm -r --cached .next"
      Write-Host "  git commit -m ""chore: stop tracking node_modules and .next"""
    } else {
      Write-Host "OK: node_modules/.next are not tracked by Git."
    }

    Write-Section "Git object store size (not working tree)"
    try {
      Invoke-Git @("count-objects", "-vH") | ForEach-Object { Write-Host $_ }
    } catch {
      Write-Host "git count-objects failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    if ($IncludeGitHistory) {
      Write-Section "Largest files in Git history (Top N blobs; may be slow)"
      try {
        # Equivalent of:
        # git rev-list --objects --all
        #   | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)'
        #   | filter blob
        #   | sort by size desc
        $rev = Invoke-Git @("rev-list", "--objects", "--all")
        $batch = $rev | & git cat-file --batch-check="%(objecttype) %(objectname) %(objectsize) %(rest)"
        $blobs =
          $batch |
          Where-Object { $_ -match '^blob ' } |
          ForEach-Object {
            $parts = $_ -split '\s+', 4
            [pscustomobject]@{
              Type = $parts[0]
              Oid  = $parts[1]
              SizeBytes = [long]$parts[2]
              Path = if ($parts.Count -ge 4) { $parts[3] } else { "" }
              Size = Format-Bytes ([long]$parts[2])
            }
          } |
          Sort-Object SizeBytes -Descending

        $blobs | Select-Object -First $TopN Size, SizeBytes, Oid, Path | Format-Table -AutoSize
        Write-Host ""
        Write-Host "If you need to rewrite history, prefer git-filter-repo or BFG (requires everyone to re-clone)." -ForegroundColor Yellow
      } catch {
        Write-Host "Scan failed: $($_.Exception.Message)" -ForegroundColor Yellow
      }
    } else {
      Write-Host ""
      Write-Host "Tip: re-run with -IncludeGitHistory to scan large files in history." -ForegroundColor DarkGray
    }
  } else {
    Write-Host ""
    Write-Host "No .git directory detected. If this is not a Git repo, ignore Git-related output." -ForegroundColor DarkGray
  }
} finally {
  Pop-Location
}
