param(
  [int]$Port = 5000
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "[BOOT] Preparing backend on port $Port ..."

$listeningPids = @()

try {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen
  if ($conns) {
    $listeningPids += ($conns | Select-Object -ExpandProperty OwningProcess)
  }
} catch {}

if (-not $listeningPids -or $listeningPids.Count -eq 0) {
  $lines = netstat -ano -p tcp | Select-String ":$Port"
  foreach ($line in $lines) {
    $parts = ($line.ToString() -replace "\s+", " ").Trim().Split(" ")
    if ($parts.Length -ge 5 -and $parts[1] -like "*:$Port" -and $parts[3] -eq "LISTENING") {
      $listeningPids += [int]$parts[4]
    }
  }
}

$listeningPids = $listeningPids | Sort-Object -Unique
foreach ($procId in $listeningPids) {
  if ($procId -ne $PID) {
    Write-Host "[BOOT] Stopping existing process on port ${Port}: PID $procId"
    Stop-Process -Id $procId -Force
  }
}

$ErrorActionPreference = "Continue"
$env:APP_DEBUG = "0"

Write-Host "[BOOT] Starting backend ..."
python -u "backend/app.py"
