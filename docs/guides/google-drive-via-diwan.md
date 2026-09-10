# Sources Google Drive — accès par Diwan

## État vérifié le 10 septembre 2026

Google Drive suit la même décision d’architecture que NotebookLM et Notion :
Qalem utilise Diwan comme unique frontière documentaire. Il n’installe ni
n’active de serveur MCP Google Drive direct.

Le consommateur Diwan de Qalem est déjà tenant-scopé. Il conserve la sélection
d’une source avec corpus, version et empreinte, puis ne récupère que des
passages bornés lors de la génération. Une version différente, une source
inaccessible ou une preuve insuffisante interrompt le parcours de génération.

## Portée attendue

Pour une source Google Drive, Diwan doit fournir au minimum l’identifiant
interne de corpus et de source, la version, l’empreinte et les passages
autorisés. Cette représentation couvre le contenu approuvé, sans exposer dans
Qalem des jetons OAuth Google ni les identifiants bruts des documents.

Qalem ne doit pas prétendre prendre en charge Google Docs, Slides ou PDF tant
que Diwan ne garantit pas cette correspondance et les droits associés pour le
tenant. L’import manuel d’un export Drive reste un import documentaire local.

## Conditions restantes

Le contrat Diwan v1 disponible ne couvre pas encore la connexion Google Drive,
la recherche de fichiers, la lecture des formats Docs, Slides ou PDF, ni la
révocation d’un droit fournisseur. Le projet Diwan doit donc livrer :

- le contrat de ces formats et des droits par organisation ;
- le mapping fichier/version vers corpus/source/version Diwan ;
- le traitement de la révocation et de la perte de droits ;
- un jeton interservice dédié à chaque tenant.

La recette de clôture exigera une source autorisée de chaque format supporté,
puis le refus d’un document hors droits, l’utilisation traçable dans une
formation et la vérification du retrait. Ces prérequis ne peuvent pas être
créés depuis le dépôt Qalem.
