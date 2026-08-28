# S1-010 — Export PPTX re-vérifié dans Microsoft PowerPoint

## Verdict

S1-010 est soldée au SHA `f9af878774704666a055f12d91d27cbe56d47414`.

Le fichier de preuve est produit par l’exporteur PPTX de Qalem sur ServeurIA, puis ouvert et rendu par Microsoft PowerPoint 16.0 sur Windows. Les contenus français et arabes, leurs accents, leur écriture droite-à-gauche et les notes de présentation sont conservés. Les packages `mathml2omml` et `pptxgenjs` sont régénérés par le `postinstall` racine, sans résidu Git parasite.

## Preuve du fichier réel

- Générateur suivi : `scripts/proofs/generate-s1-010-pptx.ts`.
- Environnement d’exécution : worktree isolé `/tmp/qalem-s6013-155f9b3` au SHA exact, dans l’image `qalem-validation:playwright-1.58.2-ffmpeg` sur ServeurIA.
- Résultat : deux diapositives, 54 793 octets.
- SHA-256 du PPTX : `a9bd5216d968c8e00c507eba71945f9c4a9cf13f9fcdf6e89d39acf0420b03b9`.
- Tests ciblés : 10/10 fichiers et 17/17 tests `tests/edit/round-trip/`.
- Journal ciblé : `/tmp/qalem-s1010-targeted-f9af878.log`, SHA-256 `b217511a8a90ebd9fcea7eb69b0404c82bbfdfe1b247c2cc08ea6fd4173a421d`.

## Ouverture Microsoft PowerPoint

Le PPTX transféré sur Windows conserve exactement le SHA-256 produit sur ServeurIA. L’automation COM ouvre le fichier en lecture seule et sans fenêtre avec Microsoft PowerPoint 16.0, sans exception d’ouverture. PowerPoint retrouve les quatre textes visibles attendus et les deux actions vocales dans les pages de notes, puis exporte chaque diapositive en PNG.

Les bornes calculées par PowerPoint pour chaque zone de texte restent comprises dans le canevas de 720 × 405 points. Les deux PNG ont été inspectés individuellement à leur résolution originale de 1 600 × 900 : aucun chevauchement, aucune coupe, aucun remplacement de glyphes et aucun problème RTL n’est visible.

- Preuve structurée : `C:\projets\Qalem\proofs\S1-010-f9af878\powerpoint-open-evidence.json`.
- SHA-256 de la preuve : `bceff58068c6f7af39cf2680e44b8b187ac176c77e1e2bd06f5537c049b93273`.
- Rendu 1 : SHA-256 `3ddeaf5c381232f75451a6447cd535df20e2ef9e06cbde0cde227803f4250a72`.
- Rendu 2 : SHA-256 `bd9fdbe9f2de74730bf61f7fddf5cbb9fe3c20deb6d98197f02f3ee2435df300`.

Cette preuve n’infère pas l’absence de réparation depuis la seule validité OOXML : elle repose sur l’ouverture effective par le moteur PowerPoint, la relecture du contenu et le rendu des deux diapositives.

## Preuve du postinstall et correction découverte

Les dossiers générés ont été reconstruits par le script `postinstall` racine. Les artefacts contrôlés sont non vides et datés après le début de l’exécution :

- `packages/mathml2omml/dist/index.js` : 74 097 octets ;
- `packages/mathml2omml/dist/index.cjs` : 74 121 octets ;
- `packages/mathml2omml/dist/index.d.ts` : 857 octets ;
- `packages/pptxgenjs/dist/pptxgen.es.js` : 521 617 octets ;
- `packages/pptxgenjs/dist/pptxgen.cjs.js` : 521 630 octets.

La première preuve complète a révélé que `find-cache-dir` retournait une valeur absente dans le contexte pnpm/Docker : `rollup-plugin-typescript2` écrivait alors son cache dans `packages/pptxgenjs/undefined/`. La configuration Rollup fixe désormais explicitement le cache sous `node_modules/.cache/rollup-plugin-typescript2`. Une nouvelle exécution du `postinstall` reste verte, ne recrée plus le dossier `undefined` et laisse le worktree propre hors `packages/omml2mathml/node_modules/`, résidu préexistant volontairement préservé.

- Journal : `/tmp/qalem-s1010-postinstall-f9af878.log`.
- SHA-256 : `7851bbdee6eaa441c992efc2d12d0c6f4d6f493872ec65ab2f8f9d9c095f7ab7`.

## Gate complet

Commande exacte sur ServeurIA avec `NODE_OPTIONS=--max-old-space-size=6144` :

```text
pnpm check && npx tsc --noEmit && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Résultat :

- Prettier, TypeScript et ESLint : zéro erreur ;
- Vitest : 385/385 fichiers et 2 505/2 505 tests ;
- Next.js : 100/100 pages générées ;
- Playwright : 83/83 scénarios en 3,7 minutes ;
- `packages/pptxgenjs/undefined` : absent après le gate ;
- état Git distant : uniquement `packages/omml2mathml/node_modules/`, préexistant et hors périmètre.

Journal : `/tmp/qalem-s1010-full-gate-f9af878.log`, SHA-256 `c489ef0438f825852e4b57cdebcecdbbab0c5447817739a4ba6c27a5b9337473`.
