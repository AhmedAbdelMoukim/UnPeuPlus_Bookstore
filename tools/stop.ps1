$ErrorActionPreference = 'Stop'
$pidFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.runtime/server.json'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Output 'Aucun serveur du projet à arrêter.'; exit 0 }
$saved = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$process = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'iisexpress' -and $process.StartTime.ToUniversalTime().ToString('o') -eq $saved.started) {
    Stop-Process -Id $process.Id
    Write-Output 'Le serveur UnPeuPlus a été arrêté.'
} else { Write-Output 'Le serveur du projet est déjà arrêté.' }
Remove-Item -LiteralPath $pidFile
