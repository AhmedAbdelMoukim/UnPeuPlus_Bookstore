param([Parameter(Mandatory=$true)][string]$Database)
$ErrorActionPreference='Stop'
$c=New-Object -ComObject ADODB.Connection
$c.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$Database")
try {
  # Uniquement appelé sur la copie temporaire créée par test.ps1.
  $today=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'Atlantic Standard Time').Date
  $cases=@(
    @{id=17;start=$today;end=$today.AddMonths(6)},
    @{id=18;start=$today.AddMonths(-6);end=$today},
    @{id=19;start=$today.AddMonths(-6).AddDays(-1);end=$today.AddMonths(1)},
    @{id=20;start=$today.AddDays(1);end=$today.AddMonths(6)},
    @{id=21;start=$today.AddDays(-1);end=$today.AddDays(-1)}
  )
  foreach($case in $cases) {
    $start=$case.start.ToString('MM/dd/yyyy',[Globalization.CultureInfo]::InvariantCulture)
    $end=$case.end.ToString('MM/dd/yyyy',[Globalization.CultureInfo]::InvariantCulture)
    $c.Execute("UPDATE nouveautes SET dateApparution=#$start#, dateEcheance=#$end# WHERE NumLivre=$($case.id)")|Out-Null
  }
  $c.Execute('UPDATE livres SET quantite=1 WHERE Numlivre=37')|Out-Null
} finally {$c.Close()}
