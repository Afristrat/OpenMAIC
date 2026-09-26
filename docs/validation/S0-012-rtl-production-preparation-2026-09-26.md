# S0-012 — Préparation du verdict RTL en production

Date : 26 septembre 2026

Production déployée : `0a15d648fcb20061ccfa79059d0d68cdec6e7bfb`

Routes contrôlées :

- `https://qalem.ma/app` ;
- `https://qalem.ma/settings` ;
- `https://qalem.ma/admin` ;
- `https://qalem.ma/org/aa7870b7-3938-4f24-b8bf-4a9d73565ba7/admin`.

Preuves :

- `docs/evidence/s0-012-rtl-app-production-2026-09-26.png`, SHA-256 `36613b2f5d1c3beb9aaa3feb9eadb5f4c5fcbeef0f43c549e6821695706e4aed` ;
- `docs/evidence/s0-012-rtl-settings-production-0a15d648.png`, SHA-256 `b3b48860f8d412d37fcd2983fdb9c47843c331fe5d01d51836361b13def9a382` ;
- `docs/evidence/s0-012-rtl-super-admin-production-0a15d648.png`, SHA-256 `1b7b542e088bdc5a2a26abc2af975102121daeb70808ba49f3a4446e1101c191` ;
- `docs/evidence/s0-012-rtl-org-admin-production-0a15d648.png`, SHA-256 `1db9fb99f65059088c86c1da99be97b3b4c088367736ceb66d8d9cf6d38cdb2e`.

## Contrôles objectifs

Une session temporaire du super-administrateur existant a ouvert la production avec `locale=ar-MA`, sans création de compte ni mutation de tenant.

- `html[dir]` vaut `rtl` ;
- `html[lang]` vaut `ar-MA` ;
- la largeur du document est identique à celle de la fenêtre, soit `1585 px`, sans débordement horizontal ;
- la navigation globale est placée à droite sur les quatre écrans ;
- le formulaire principal, les barres d’actions et la grille des formations sont visiblement réordonnés de droite à gauche ;
- la flèche de retour de l’administration Human Yo Impact pointe désormais vers la droite en arabe ;
- les textes arabes visibles sont liés correctement, sans mojibake.

Le déploiement Coolify `knjgq73sc0fl6yrdarsfsbg3` a terminé sur le SHA exact. Le conteneur `bcx5pxyuc9z3lt4jtyjipcqu-014702271694` est `healthy`, sans redémarrage ni OOM, et `/api/health` répond HTTP 200. Avant déploiement, le gate intégral du même SHA a passé Prettier, TypeScript, ESLint, 3 402 tests Vitest, le build Next.js et 200 tests Playwright.

## Limite de la preuve

Ces quatre captures couvrent les surfaces prioritaires et corrigent le défaut objectif trouvé pendant la recette. Elles ne remplacent pas le verdict humain obligatoire sur la checklist complète de `docs/foundation/0-socle/checklist-rtl.md`. `S0-012` reste donc `to_validate/passes=false`.

## Verdict humain du 26 septembre 2026

Les quatre captures ont été affichées directement à Amine, avec une demande
explicite de jugement sur le sens, l’alignement, la navigation à droite et la
flèche de retour. Amine répond : « je valide ».

Aucun fichier fonctionnel des quatre surfaces n’a changé entre le SHA des
captures `0a15d648fcb20061ccfa79059d0d68cdec6e7bfb` et le SHA fonctionnel courant
`38e5bc87567f8f96f4fba8521d60ad02c498a7a1` ; seuls les artefacts de preuve et
le parcours ASR ont évolué. La production répond HTTP 200 et son conteneur est
`running/healthy`, sans redémarrage ni OOM.

S0-012 est certifiée `completed/passes=true`.
