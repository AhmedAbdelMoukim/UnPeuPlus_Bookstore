LIBRAIRIE UNPEUPLUS — PROJET ADSI-3541

LANCEMENT
1. Double-cliquer sur Lancer-le-site.cmd.
2. Le site s'ouvre à http://localhost:8085/.
3. Pour arrêter le serveur, double-cliquer sur Arreter-le-site.cmd.

Le lancement fonctionne depuis un dossier contenant des espaces. Il ne nécessite
ni npm, ni abonnement, ni service distant. Ne pas ouvrir index.html directement :
les opérations de lecture et d'écriture nécessitent le serveur ASP.NET.

PRÉREQUIS
Windows, .NET Framework 4.8, IIS Express 32 bits et Microsoft Jet OLE DB 4.0.
Ces composants sont présents sur l'ordinateur utilisé pour préparer le projet.
Le runtime dotnet 8 n'est pas utilisé : il s'agit d'un site ASP.NET Framework.
Sur un autre ordinateur, installer IIS Express depuis Microsoft si nécessaire.
Le processus doit être 32 bits pour pouvoir ouvrir la MDB avec Jet.
Le compte Windows doit pouvoir écrire dans UnPeuPlus/App_Data et .runtime.
Visual Studio : Fichier > Ouvrir > Site Web > sélectionner le dossier UnPeuPlus.
Lancer avec IIS Express 32 bits ; le script fourni reste le chemin le plus simple.

PORT OCCUPÉ
Depuis PowerShell dans le dossier du projet :
  powershell -ExecutionPolicy Bypass -File tools/start.ps1 -Port 8086
Le script conserve le port utilisé et évite de lancer deux fois son serveur.

CONTENU
- UnPeuPlus/index.html : structure et navigation du site.
- UnPeuPlus/assets/styles.css : identité visuelle et mises en page adaptatives.
- UnPeuPlus/assets/app.js : catalogue, recherche, formulaires et panier.
- UnPeuPlus/api.ashx : point d'entrée de l'API ASP.NET.
- UnPeuPlus/App_Code/LibraryApi.cs : logique métier C# et accès OleDb.
- UnPeuPlus/App_Data/categories.xml : catégories lues par ASP.NET.
- UnPeuPlus/App_Data/librairie.mdb : base de travail du site.
- UnPeuPlus/remise.html : présentation de l'équipe, du projet et synthèse.
- tools/initialize-db.ps1 : création initiale de la copie Access.
- tools/test.ps1 et tests/integration.mjs : tests reproductibles sur une copie.
- librairie.mdb : base originale, conservée sans modification.

PAGE DE PRÉSENTATION
Ouvrir « À propos du projet » en pied de page du site. Cliquer sur les champs
« À compléter » pour saisir l'équipe, les membres et la date. Les saisies sont
conservées dans le navigateur. Utiliser « Imprimer / Enregistrer en PDF » pour
produire le document de remise au format A4. Désactiver les en-têtes et
pieds de page du navigateur lors de l'impression. Les textes sont aussi
directement modifiables dans UnPeuPlus/remise.html.

DÉMONSTRATION CONSEILLÉE
1. Explorer l'accueil et les trois catégories.
2. Rechercher « Algorithms », modifier le tri et consulter une fiche.
3. Ouvrir les nouveautés puis leurs archives.
4. Ajouter deux livres, modifier une quantité et retirer un article.
5. Créer un compte avec des coordonnées de démonstration, un nom d'utilisateur
   unique et un mot de passe d'au moins 10 caractères.
6. Vérifier l'adresse dans le panier et confirmer la commande.
7. Retrouver la référence et les articles dans « Mes commandes ».
8. Se déconnecter, se reconnecter et constater que l'historique est conservé.

Il n'y a pas de compte précréé ni de mot de passe par défaut.
Le panier est mémorisé dans le navigateur ; les comptes et commandes sont dans
Access. Sur un ordinateur partagé, penser à vider son panier et se déconnecter.
Les commandes sont pédagogiques : ni paiement ni expédition réelle. Les prix
sont en dollars canadiens. Aucune taxe ou frais non demandé n'est inventé.

NOUVEAUTÉS ET DONNÉES FOURNIES
Les 39 livres proviennent de la MDB. Le filtre utilise dateApparution et
dateEcheance de la table nouveautes, une fenêtre de six mois calendaires et
la date réelle du fuseau Atlantique. L'état « Neuf » n'est pas une nouveauté.
Les 16 anciennes nouveautés datent de 2021 ; à la date actuelle aucune n'est
récente. L'écran vide est intentionnel et renvoie vers les archives. Les dates
historiques ne sont pas artificiellement actualisées. Pour une démonstration
avec un livre récent, modifier explicitement les dates dans LA COPIE de travail
avec Access, ou utiliser les fixtures temporaires des tests.

La catégorie « Technologi » du livre 9 est normalisée en « Technologie » dans
la copie. Les autres titres, auteurs et descriptions restent ceux de la MDB ;
certaines notices semblent contenir des inversions ou des classements anciens.
Les couvertures sont des créations graphiques, non les couvertures officielles.

EXTENSIONS DU SCHÉMA DE LA COPIE
- clients.tel devient TEXT(30), pour conserver les numéros de dix chiffres.
  Le type entier signé d'origine ne permet pas de stocker de nombreux numéros.
- commandes : ajout de NumCommande (LONG) et PrixUnitaire (CURRENCY).
- commandes_entetes : numéro, client, référence, jeton unique, date, total,
  adresse au moment de la commande et statut.
- Index unique sur authentification.login et sur le jeton des commandes.
- Trois ressources pédagogiques sont insérées dans liens, initialement vide.
Les tables et identifiants existants sont conservés. Les clés non automatiques
sont allouées sous verrou applicatif, dans une transaction. L'application est
prévue pour un seul processus IIS Express, comme dans cette remise locale.

PROTECTION ET VALIDATION
Requêtes OleDb paramétrées ; validation serveur ; mots de passe PBKDF2-SHA256
(210 000 itérations, sel aléatoire par compte) ; jetons anti-CSRF ; cookies
HttpOnly/SameSite ; limitation des tentatives de connexion par adresse locale ;
politique CSP et échappement des données à l'affichage. Le serveur recalcule
les prix et décrémente le stock dans la même transaction que la commande.
Une répétition du même jeton de commande renvoie la commande existante.
App_Data est protégé par ASP.NET et n'est pas accessible comme fichier Web.
La session expire après 30 minutes d'inactivité. Les formulaires ne conservent
jamais les mots de passe dans le stockage du navigateur.

TESTS
Node.js 18+ est nécessaire uniquement pour lancer les tests (pas pour le site).
Exécuter :
  powershell -ExecutionPolicy Bypass -File tools/test.ps1
Le script copie les sources et initialise une base depuis la MDB originale
dans un sous-dossier unique de .runtime,
prépare des cas de dates et de stock, démarre une instance IIS séparée, teste
les API puis arrête cette instance. La base livrée reste sans données de test.
Les rapports sont écrits dans .runtime/test-report.txt et frontend-report.txt.
Les contrôles HTML ne remplacent pas une vérification visuelle dans un navigateur.

DÉPANNAGE
- « Provider non enregistré » : vérifier l'utilisation de IIS Express 32 bits.
- Erreur 500 : vérifier les permissions d'écriture du dossier App_Data et
  consulter .runtime/iis.log, .runtime/iis-error.log et, en cas d'erreur API,
  UnPeuPlus/App_Data/errors.log.
- Ne pas renommer les colonnes Access ou déplacer la base App_Data.
- Si le navigateur conserve une ancienne version, utiliser Ctrl+F5.
- Si la session expire pendant un formulaire, actualiser puis se reconnecter.
- Après dix tentatives de connexion échouées, attendre quinze minutes.

REMISE
Remettre le dossier complet (sources, MDB originale, MDB de travail, scripts,
guide) et la présentation imprimée en PDF une fois les informations d'équipe
complétées. Le dossier .runtime contient uniquement des journaux et copies de
test : il n'est pas nécessaire à la remise. Aucun hébergement public n'est requis.
