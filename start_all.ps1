param(
  [int]$BackendPort = 5000,
  [int]$FrontendPort = 5500
)

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Stop-PortListeners {
  param([int]$PortToFree)
  $pids = @()
  try {
    $conns = Get-NetTCPConnection -LocalPort $PortToFree -State Listen
    if ($conns) {
      $pids += ($conns | Select-Object -ExpandProperty OwningProcess)
    }
  } catch {}

  if (-not $pids -or $pids.Count -eq 0) {
    $lines = netstat -ano -p tcp | Select-String ":$PortToFree"
    foreach ($line in $lines) {
      $parts = ($line.ToString() -replace "\s+", " ").Trim().Split(" ")
      if ($parts.Length -ge 5 -and $parts[1] -like "*:$PortToFree" -and $parts[3] -eq "LISTENING") {
        $pids += [int]$parts[4]
      }
    }
  }

  $pids = $pids | Sort-Object -Unique
  foreach ($procId in $pids) {
    if ($procId -ne $PID) {
      Write-Host "[BOOT] Stopping process on port ${PortToFree}: PID $procId"
      Stop-Process -Id $procId -Force
    }
  }
}

Write-Host "[BOOT] Starting full stack from $root"
Stop-PortListeners -PortToFree $BackendPort
Stop-PortListeners -PortToFree $FrontendPort

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", "Set-Location '$root'; .\start_backend.ps1 -Port $BackendPort"
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", "Set-Location '$root\frontend'; python -m http.server $FrontendPort"
)

Start-Sleep -Seconds 3

$ErrorActionPreference = "Continue"
Write-Host ""
Write-Host "[CHECK] Backend health..."
try {
  $h = Invoke-RestMethod "http://127.0.0.1:$BackendPort/health" -Method Get
  Write-Host ("[OK] Backend up: " + ($h | ConvertTo-Json -Compress))
} catch {
  Write-Host "[WARN] Backend health check failed."
}

Write-Host "[CHECK] ESP status..."
try {
  $e = Invoke-RestMethod "http://127.0.0.1:$BackendPort/esp-status" -Method Get
  Write-Host ("[OK] ESP status: " + ($e | ConvertTo-Json -Compress))
} catch {
  Write-Host "[WARN] ESP status failed. Keep ESP powered + on same Wi-Fi."
}

Write-Host ""
Write-Host "Open app URLs:"
Write-Host ("- Backend-served app (recommended): http://127.0.0.1:{0}" -f $BackendPort)
Write-Host ("- Frontend-only server:             http://127.0.0.1:{0}/index.html" -f $FrontendPort)
Write-Host ""
Write-Host "If using ngrok, tunnel backend port 5000:"
Write-Host "ngrok http 5000"
