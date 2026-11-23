param([string]$Destination)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$target = if ($Destination) { $Destination } else { Join-Path $root 'UnPeuPlus/App_Data/librairie.mdb' }
if (Test-Path -LiteralPath $target) { Write-Output 'La base de travail existe déjà : données conservées.'; exit 0 }
Copy-Item -LiteralPath (Join-Path $root 'librairie.mdb') -Destination $target
$connection = New-Object -ComObject ADODB.Connection
try {
    $connection.Open("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$target")
    # Extensions limitées à la copie de travail. Les identifiants d'origine sont conservés.
    $sql = @(
        'ALTER TABLE clients ALTER COLUMN tel TEXT(30)',
        'ALTER TABLE commandes ADD COLUMN NumCommande LONG',
        'ALTER TABLE commandes ADD COLUMN PrixUnitaire CURRENCY',
        'CREATE TABLE commandes_entetes (NumCommande LONG CONSTRAINT PK_entetes PRIMARY KEY, NumClient LONG NOT NULL, ReferenceCommande TEXT(40) NOT NULL, Jeton TEXT(64) NOT NULL, DateCreation DATETIME NOT NULL, Total CURRENCY NOT NULL, Adresse MEMO NOT NULL, Statut TEXT(30) NOT NULL)',
        'CREATE UNIQUE INDEX UX_login ON authentification ([login])',
        'CREATE UNIQUE INDEX UX_jeton ON commandes_entetes (Jeton)',
        'CREATE INDEX IX_commandes_client ON commandes (NumClient)',
        "UPDATE livres SET categorie='Technologie' WHERE categorie='Technologi'",
        "INSERT INTO liens (NumLiens,nomSite,lienSite,description) VALUES (1,'Bibliothèque et Archives nationales du Québec','https://www.banq.qc.ca/','Des ressources et des collections pour prolonger vos découvertes.')",
        "INSERT INTO liens (NumLiens,nomSite,lienSite,description) VALUES (2,'MDN Web Docs','https://developer.mozilla.org/fr/','Une référence pour apprendre HTML, CSS et JavaScript.')",
        "INSERT INTO liens (NumLiens,nomSite,lienSite,description) VALUES (3,'MIT OpenCourseWare','https://ocw.mit.edu/','Des cours ouverts pour explorer informatique, sciences et gestion.')"
    )
    foreach ($statement in $sql) { $connection.Execute($statement) | Out-Null }
    Write-Output 'Base Access initialisée : 39 livres et extensions pour les commandes.'
} catch {
    if ($connection.State -eq 1) { $connection.Close() }
    # Une initialisation incomplète est isolée, jamais utilisée par le site.
    Move-Item -LiteralPath $target -Destination ($target + '.initialisation-incomplete-' + [guid]::NewGuid().ToString('N'))
    throw
} finally { if ($connection.State -eq 1) { $connection.Close() } }
