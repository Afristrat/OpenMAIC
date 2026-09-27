# Ordre d’exécution Diwan pour clôturer les dépendances Qalem

## Statut

Cet ordre d’exécution prépare le travail de la session propriétaire Diwan. Il
n’accorde aucun droit d’écriture transfrontalier et ne vaut pas livraison. Au
27 septembre 2026, Qalem est prêt à consommer le contrat v1, mais aucun jeton
consommateur Qalem n’est émis et Diwan ne fournit aucune intégration
fonctionnelle NotebookLM, Notion ou Google Drive.

## Frontière à préserver

- Qalem ne se connecte directement à aucun des trois fournisseurs.
- Diwan détient les autorisations fournisseur, les documents, le découpage et
  les embeddings ; Qalem reçoit uniquement des références versionnées et des
  passages autorisés.
- Chaque organisation Qalem reçoit un jeton interservice Diwan distinct. Un
  jeton partagé entre deux organisations est interdit.
- Aucun secret fournisseur, jeton OAuth ou identifiant privé ne traverse le
  navigateur Qalem, une URL, un journal ou une erreur utilisateur.
- Le contrat consommé par Qalem reste
  `https://diwan.ai-mpower.com/api/v1/consumers/qalem`, version `1.0`.

## Lot 1 : consommateur Qalem générique

1. Émettre un jeton de service dédié à un tenant de recette Qalem et conserver
   son association tenant Diwan ↔ UUID Qalem côté Diwan.
2. Garantir sur toutes les opérations le cloisonnement par jeton : liste,
   ingestion, statut, manifeste, recherche, alignement, conflits et révocation.
3. Retourner `contractVersion` et `requestId`, puis refuser les ressources hors
   tenant sans révéler leur existence.
4. Documenter l’expiration, la rotation et la révocation du jeton consommateur.
5. Transmettre le jeton par le coffre contrôlé afin que Qalem construise
   `QALEM_DIWAN_TENANT_TOKENS` sans valeur en clair dans Git ou le chat.

## Lot 2 : connecteurs propriétaires

### NotebookLM

- Autoriser un compte et ses notebooks pour une organisation Diwan.
- Rechercher un notebook et ses sources autorisées.
- Conserver la correspondance
  `notebook/source → corpus/source/version/checksum`.
- Répercuter modification, perte de droit et révocation.

### Notion

- Implémenter l’autorisation par organisation sans credential global partagé.
- Rechercher et lire les pages ou bases explicitement autorisées.
- Conserver la correspondance
  `page/version → corpus/source/version/checksum`.
- Répercuter modification, perte de droit et révocation.

### Google Drive

- Implémenter l’autorisation par organisation.
- Rechercher et lire séparément Google Docs, Google Slides et PDF autorisés.
- Conserver la correspondance
  `file/version → corpus/source/version/checksum`.
- Répercuter modification, perte de droit et révocation.

Un export manuel importé dans Diwan ne prouve aucun de ces connecteurs.

## Recette obligatoire

La session Diwan fournit à la session Qalem, sans secret ni contenu privé :

- commit et environnement déployés ;
- version du contrat et empreinte du document ;
- identifiants opaques des tenants et ressources de recette ;
- codes HTTP, `requestId`, statuts et empreintes nécessaires à la corrélation ;
- preuve de suppression ou révocation des fixtures.

La recette intégrée utilise deux tenants et couvre :

1. liste vide autorisée puis import ;
2. suivi jusqu’à un état terminal ;
3. manifeste versionné et recherche de passages ;
4. génération Qalem citant réellement ces passages ;
5. refus croisé entre tenants et refus d’une ressource retirée ;
6. perte de droit fournisseur, révocation et indisponibilité ;
7. rotation du jeton sans période de jetons simultanément valides non bornée ;
8. NotebookLM, Notion, Google Docs, Google Slides et PDF, chacun par une source
   autorisée puis un cas refusé.

Qalem rejoue ensuite sa gate complète au SHA intégrant la configuration, déploie
le web et vérifie l’image exacte, la santé, les redémarrages et l’absence d’OOM.

## Conditions de clôture

- S6-003 : contrat générique et recette à deux tenants réussis.
- S-019 : NotebookLM réellement connecté, utilisé, refusé hors droits et retiré.
- S-020 : Notion réellement connecté, utilisé, refusé hors droits et retiré.
- S-021 : Docs, Slides et PDF réellement connectés, utilisés, refusés hors
  droits et retirés.

Aucune story ne passe à `completed` sur la seule présence de code, d’un import
manuel, d’un HTTP 401 anonyme ou d’un jeton non recetté.
