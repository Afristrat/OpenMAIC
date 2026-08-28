# S1-004 — Recette du catalogue interne

Date : 28 août 2026

Branche : `refork-v030`

SHA du code et du harnais recettés : `1b41590969e196f495c7613f4658c824f0638d6e`

SHA de l’application de production : `2123640917d365c15eb9ecc51723bc43d6483e2b`

## Cause racine corrigée

La route et l’interface du catalogue existaient déjà, mais `isFeatureEnabled('course_catalog')` échouait volontairement en mode fermé lorsque la ligne du flag n’existait pas. Aucune migration ne créait cette ligne.

La migration idempotente `00045_enable_course_catalog.sql` inscrit désormais `course_catalog` comme flag global actif. Son test permanent vérifie l’upsert, le nom exact, l’activation et la portée globale. L’état équivalent a été appliqué puis relu dans la base Qalem de production : une seule ligne active, globale, avec sa description attendue.

## Parcours de production

Le harnais `scripts/proofs/run-s1-004-production.sh` crée un compte, une organisation, une classroom et un cours `ready` initialement non publié, tous préfixés par un marqueur unique. `scripts/proofs/s1-004-production.ts` utilise ensuite Chromium headless contre `https://qalem.ma`, sans interception réseau :

1. authentification du compte temporaire et chargement du catalogue de son organisation ;
2. présence du cours dans « Formations prêtes à publier » ;
3. clic sur « Publier au catalogue » et réponse HTTP 200 de la vraie route de publication ;
4. apparition du lien du cours publié, puis navigation vers sa vraie classroom persistée ;
5. chargement de la scène de la classroom ;
6. basculement de la langue par le contrôle réel `FR` → `AR`, titre arabe du catalogue visible et `dir="rtl"` sur le document.

Résultat final : `unpublishedVisible=true`, `publicationApiStatus=200`, `publishedVisible=true`, `classroomReached=true`, `arabicRtl=true`, aucune erreur console et aucune réponse HTTP 5xx.

Artefacts ServeurIA :

- journal `/tmp/qalem-s1004-production-1b41590.log`, SHA-256 `f31ab59615d9b645e654aeaa102f0537931b9ed8e900f50f0fe49bfbb25e5560` ;
- preuve JSON `/tmp/qalem-s1004-artifacts/s1004-20260828T125554Z-28542/evidence.json`, SHA-256 `16889b4f3983a5aa5d8f6d8414a22979f2b89348b72d213b90ee77b98e191485` ;
- capture `/tmp/qalem-s1004-artifacts/s1004-20260828T125554Z-28542/catalog-to-classroom.png`, SHA-256 `acbac983de6afaefc0c6ac25d066d51a8c66ee6f977f7820259c17a19ed9c851`.

## Nettoyage et gate

Avant nettoyage, l’audit retrouve exactement le compte, le cours, la classroom et l’organisation de recette. Après suppression, il retourne `authExists=false` et les trois compteurs à zéro.

Le gate complet au SHA `1b41590969e196f495c7613f4658c824f0638d6e`, dans `qalem-validation:playwright-1.58.2-ffmpeg` sur ServeurIA avec `NODE_OPTIONS=--max-old-space-size=6144`, passe :

- Prettier, TypeScript et ESLint ;
- 379 fichiers et 2 491 tests Vitest ;
- build Next.js, 99 pages statiques ;
- 82 tests Playwright en 3,6 minutes.

Journal : `/tmp/qalem-s1004-full-gate-1b41590.log`, SHA-256 `29feb29757f421566bce0c1ad24350413930078afa2e9e8a6644bd984ef95774`.
