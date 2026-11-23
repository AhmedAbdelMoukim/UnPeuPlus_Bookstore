param([int]$Port=8086)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if(!(Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 18+ est requis pour exécuter les tests.'}
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw "Le port de test $Port est occupé. Utiliser -Port 8087."}
$runtime=Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $runtime|Out-Null
$target=Join-Path $runtime ('tests-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $target | Out-Null
Get-ChildItem -LiteralPath (Join-Path $root 'UnPeuPlus') | Where-Object Name -ne 'App_Data' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse }
New-Item -ItemType Directory -Path (Join-Path $target 'App_Data') | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'UnPeuPlus/App_Data/categories.xml') -Destination (Join-Path $target 'App_Data/categories.xml')
$database=Join-Path $target 'App_Data/librairie.mdb'
& "$env:WINDIR/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'initialize-db.ps1') -Destination $database
if($LASTEXITCODE -ne 0){throw 'Initialisation de la base de test impossible.'}
& "$env:WINDIR/SysWOW64/WindowsPowerShell/v1.0/powershell.exe" -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'test-fixtures.ps1') -Database $database
if($LASTEXITCODE -ne 0){throw 'Préparation des cas de test impossible.'}
$server=$null
try {
  $iis=Join-Path ${env:ProgramFiles(x86)} 'IIS Express/iisexpress.exe'
  $server=Start-Process -FilePath $iis -ArgumentList @("/path:`"$target`"","/port:$Port",'/systray:false') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $target 'test-iis.log') -RedirectStandardError (Join-Path $target 'test-error.log')
  $ready=$false
  for($i=0;$i -lt 30;$i++){
    try { $r=Invoke-WebRequest "http://localhost:$Port/api.ashx?action=session" -UseBasicParsing -TimeoutSec 3; if($r.StatusCode -eq 200){$ready=$true;break} }catch{Start-Sleep -Milliseconds 300}
  }
  if(!$ready){throw "L'instance de test n'a pas démarré : $target"}
  $ErrorActionPreference='Continue'
  & node (Join-Path $root 'tests/integration.mjs') "http://localhost:$Port" 2>&1 | Tee-Object -FilePath (Join-Path $runtime 'test-report.txt')
  $testExit=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if($testExit -ne 0){throw "Des tests ont échoué. Copie conservée dans $target"}
  $ErrorActionPreference='Continue'
  & node (Join-Path $root 'tests/frontend.mjs') "http://localhost:$Port" 2>&1 | Tee-Object -FilePath (Join-Path $runtime 'frontend-report.txt')
  $frontendExit=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if($frontendExit -ne 0){throw 'Des contrôles de structure HTML ont échoué.'}
  Write-Output "Copie de test : $target"
} finally {if($server -and !$server.HasExited){Stop-Process -Id $server.Id}}
