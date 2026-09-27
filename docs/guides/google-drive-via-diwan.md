# Sources Google Drive : accès par Diwan

## Architecture livrée le 27 septembre 2026

Qalem utilise Diwan comme frontière documentaire unique et n’installe aucun
connecteur Google Drive direct. Le navigateur appelle l’API Qalem, qui transmet
la commande au contrat consommateur Diwan tenant-scopé. Les jetons OAuth Google
restent chiffrés dans Diwan et ne sont jamais renvoyés à Qalem.

Le contrat `qalem-document-provider-v1` couvre désormais :

- l’autorisation OAuth 2.0 Google Drive par organisation avec PKCE, état expirant
  et utilisable une seule fois ;
- la recherche des Google Docs, Google Slides et fichiers PDF autorisés ;
- l’import idempotent dans un corpus et une source Diwan ;
- l’épinglage de la version, de l’empreinte et de la provenance du fichier ;
- la révocation de la connexion et le renouvellement du jeton fournisseur ;
- des erreurs distinctes pour une connexion absente, un état OAuth invalide, une
  source inaccessible et une indisponibilité du fournisseur.

Le périmètre OAuth est volontairement limité à `drive.file`. Il ne donne pas à
Qalem un accès général au Drive d’un utilisateur : seuls les fichiers autorisés
pour l’application sont recherchables et importables.

## Parcours auteur

Dans le sélecteur de sources de la page de génération :

1. l’auteur choisit « Connecter Google Drive » ;
2. Google recueille son autorisation puis le renvoie vers Qalem ;
3. l’auteur recherche un document autorisé et sélectionne jusqu’à vingt sources
   distinctes ;
4. Qalem demande à Diwan de les importer ;
5. une fois l’indexation terminée, les sources apparaissent dans la bibliothèque
   Diwan existante et peuvent être ajoutées au plan de formation ;
6. la génération utilise uniquement les passages bornés de la version épinglée,
   avec ses références et les droits de l’organisation.

Une source devenue inaccessible, révoquée ou différente de la version approuvée
ne doit pas être remplacée silencieusement. Le parcours de génération s’arrête
avec une erreur explicite. L’import manuel reste disponible, mais il ne constitue
pas une connexion Google Drive.

## Configuration de production

Diwan attend les variables suivantes :

- `DIWAN_PUBLIC_URL=https://diwan.ai-mpower.com` ;
- `DIWAN_QALEM_RETURN_URL=https://qalem.ma/app` ;
- `DIWAN_GOOGLE_DRIVE_CLIENT_ID` ;
- `DIWAN_GOOGLE_DRIVE_CLIENT_SECRET`.

L’URI de redirection à déclarer dans le client OAuth Google est :

```text
https://diwan.ai-mpower.com/api/v1/consumers/qalem/connectors/google-drive/callback
```

Les deux secrets Google ne doivent être présents que dans le coffre et dans
l’environnement chiffré du service Diwan. Leur valeur ne doit apparaître ni dans
Qalem, ni dans les journaux, ni dans ce document.

## Recette de clôture

La story ne peut être déclarée close qu’après une recette de production prouvant
les quatre formats et états attendus :

- import et résolution d’un Google Docs autorisé ;
- import et résolution d’un Google Slides autorisé ;
- import et résolution d’un PDF autorisé ;
- refus d’un document hors droits ;
- erreur récupérable lorsque Google Drive est indisponible ;
- révocation effective de la connexion ;
- utilisation traçable d’au moins un passage importé dans une formation Qalem.

Les tests automatisés, la migration et le déploiement du contrat sont nécessaires
mais ne remplacent pas cette recette réelle.
