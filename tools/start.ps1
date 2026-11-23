param([int]$Port = 8085, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$site = Join-Path $root 'UnPeuPlus'
$runtime = Join-Path $root '.runtime'
$iis = Join-Path ${env:ProgramFiles(x86)} 'IIS Express/iisexpress.exe'
if (!(Test-Path -LiteralPath $iis)) { throw 'IIS Express 32 bits est requis. Installer IIS Express ou Visual Studio avec ASP.NET.' }
$init = Join-Path $PSScriptRoot 'initialize-db.ps1'
& "$env:WINDIR/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $init
if ($LASTEXITCODE -ne 0) { throw 'Initialisation Access impossible.' }
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$pidFile = Join-Path $runtime 'server.json'
if (Test-Path -LiteralPath $pidFile) {
    $saved = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $existing = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
    if ($existing -and $existing.ProcessName -eq 'iisexpress' -and $existing.StartTime.ToUniversalTime().ToString('o') -eq $saved.started) {
        Write-Output "Le site est déjà ouvert : http://localhost:$($saved.port)/"
        if (!$NoBrowser) { Start-Process "http://localhost:$($saved.port)/" }
        exit 0
    }
}
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw "Le port $Port est déjà utilisé. Choisir un autre port : tools/start.ps1 -Port 8086" }
$server = Start-Process -FilePath $iis -ArgumentList @("/path:`"$site`"", "/port:$Port", '/systray:false') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'iis.log') -RedirectStandardError (Join-Path $runtime 'iis-error.log')
@{pid=$server.Id;port=$Port;started=$server.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
$ready = $false
for ($i=0; $i -lt 30; $i++) {
    if ($server.HasExited) { throw "IIS Express s'est arrêté. Consulter .runtime/iis-error.log." }
    try { $response=Invoke-WebRequest -Uri "http://localhost:$Port/api.ashx?action=session" -UseBasicParsing -TimeoutSec 3; if($response.StatusCode -eq 200){$ready=$true;break} } catch { Start-Sleep -Milliseconds 400 }
}
if (!$ready) { throw "Le site ne répond pas encore. Consulter .runtime/iis.log et http://localhost:$Port/api.ashx?action=session" }
Write-Output "UnPeuPlus est prêt : http://localhost:$Port/"
if (!$NoBrowser) { Start-Process "http://localhost:$Port/" }
