# Sources Gemini Notebook Enterprise via Diwan

## État vérifié le 27 septembre 2026

L’intégration n’est pas livrée. Qalem possède le consommateur Diwan tenant-scopé et la production dispose du mapping de jetons nécessaire, mais Diwan n’expose pas encore Gemini Notebook Enterprise.

Le produit personnel NotebookLM n’est pas une base d’intégration acceptable : sa session utilisateur ne doit jamais devenir un credential global pour les tenants Qalem. Le contrat officiel programmable appartient à **Gemini Notebook Enterprise**, anciennement NotebookLM Enterprise.

## Contrat officiel disponible

Google publie désormais, en préversion, des méthodes REST `v1alpha` pour créer, récupérer, lister, partager et supprimer les notebooks, ainsi que pour ajouter, récupérer et retirer leurs sources :

- [Créer et gérer les notebooks](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks) ;
- [Ajouter et gérer les sources](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks-sources) ;
- [Configurer Gemini Notebook Enterprise](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/set-up-notebooklm) ;
- [Licences Gemini Notebook Enterprise](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/set-up-licensing).

Ce contrat exige un projet Google Cloud avec facturation, l’API Discovery Engine, un fournisseur d’identité, les rôles Cloud NotebookLM et une licence spécifique à la multirégion. L’abonnement contient au minimum quinze licences ; un essai de quatorze jours est documenté. Ces prérequis constituent une décision d’achat et de résidence des données, pas une simple variable technique.

## État du projet accessible

Le profil `gcloud` local nomme le projet `mcp-personal-assistant-481414` et le compte `a.mansouri@afriquestrategie.com`. Le 27 septembre, la lecture du numéro de projet, des API activées et de `notebooks:listRecentlyViewed` n’a pas pu être certifiée : les credentials exigent une réauthentification interactive. La réponse REST sans jeton valide est `401 UNAUTHENTICATED`. Il est donc interdit d’en déduire que l’API, la facturation ou une licence sont actives.

## Conditions exactes de déblocage

1. Réauthentifier l’identité Google Cloud propriétaire.
2. Confirmer le projet et choisir la multirégion `eu`, `us` ou `global` selon la résidence voulue.
3. Vérifier ou activer la facturation et `discoveryengine.googleapis.com`.
4. Attribuer les rôles Cloud NotebookLM Admin/User et souscrire ou démarrer l’essai de licence.
5. Définir une identité de service ou une délégation par tenant compatible avec les droits réels des notebooks ; ne jamais réutiliser un jeton utilisateur global.
6. Implémenter dans Diwan la liste des notebooks, la liste et la lecture autorisée des sources, leur versionnement vers corpus/source/version, la perte de droits et la révocation.
7. Recetter une source autorisée, une source interdite, la génération d’une formation citant un passage épinglé et le retrait d’accès.

Les étapes 2 à 4 engagent résidence, facturation et licences et restent donc une décision d’Amine. Tant qu’elles ne sont pas prises et observées, S-019 reste `blocked` et `passes=false`. Un export manuel d’un notebook ne satisfait pas cette US.
