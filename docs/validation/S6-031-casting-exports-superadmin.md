# S6-031 — Casting, exports et retour super-administrateur

Date de recette : 24 septembre 2026  
Tenant réel : Human Yo Impact  
Organisation : `aa7870b7-3938-4f24-b8bf-4a9d73565ba7`

## Contrat corrigé

- Le mode automatique utilise désormais le référentiel du tenant et restitue les dix mécanismes, sans compléter le casting depuis le catalogue global.
- Le mode manuel priorise les mécanismes choisis sans retirer les autres membres du référentiel. Les tests de sélection contrôlent dix identifiants de mécanisme uniques dans les deux modes.
- Les auto-présentations rapprochent le nom prononcé de l’identité canonique, y compris devant un point, une fin de phrase ou une conjonction.
- Les actions persistées comportent au moins une prise de parole pour chaque membre actif du casting complet.
- Une formation existante n’est pas migrée silencieusement. Les trois cours et trois classes de Human Yo Impact sont restés présents, sans création d’un quatrième cours.

## Recette Human Yo Impact

La recette authentifiée `scripts/validation/s6-031-production-casting-recipe.mjs` appelle réellement `/api/generate/agent-profiles` avec le contexte Human Yo Impact, puis relit les compteurs avant et après.

Résultat final :

- HTTP 200 ;
- 10 agents et 10 mécanismes uniques ;
- formatrice canonique : Hanae, genre féminin, avatar `/avatars/teacher-2.png`, fournisseur `higgs-tts`, voix `hanae` ;
- 3 cours avant et après ;
- 3 classes avant et après ;
- aucune formation existante réécrite ;
- persistance confirmée par un second passage sans option de configuration.

La recette a aussi chargé `/app?orgId=aa7870b7-3938-4f24-b8bf-4a9d73565ba7` dans Chromium avec la session super-administrateur. Elle a observé la bannière « Mode test du tenant : Human Yo Impact », le lien `/admin?tab=tenants` intitulé « Revenir à l’administration globale » et `isAdmin=true`. Aucun membership n’a été créé.

## Exports réels

La recette `scripts/validation/s6-031-production-exports-recipe.mjs` a utilisé la formation existante `GIWp6RedxM`, sans créer de cours.

PPTX :

- fichier `RSE appliquée au leasing marocain.pptx` téléchargé par le navigateur ;
- archive Office valide ;
- 11 diapositives ;
- 165 paragraphes ;
- accents Unicode présents ;
- aucun caractère de remplacement ou contrôle parasite détecté.

MP4 :

- job `5b761c3e-685c-4000-94ec-738ac7ef5059` ;
- état final `done` ;
- 17 scènes ;
- téléchargement `video/mp4` ;
- signature `ftyp` présente ;
- la reprise a réutilisé le même job au lieu d’en créer un second ;
- le lecteur de preuve annule le flux après le premier bloc et ne matérialise pas le fichier complet en mémoire.

## Validation technique

Avant la recette, le candidat fonctionnel a passé sur ServeurIA : Prettier, TypeScript, ESLint, 544 fichiers et 3 366 tests Vitest, le build de production et 195 scénarios Playwright. Les scénarios couvrent notamment le retour du mode tenant, les exports, le casting complet persistant et les auto-présentations.

La clôture exige en plus que le web et `qalem-runtime` servent le même SHA final, soient sains, sans redémarrage ni OOM, et que `/health` réponde 200.
