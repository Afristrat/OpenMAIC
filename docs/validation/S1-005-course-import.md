# S1-005 — Import vers un outline éditable

Date : 28 août 2026

Branche : `refork-v030`

SHA validé : `d7f570ea99ade95f924dcdb28ac49e0ac16958ce`

## Parcours livré

L’auteur atteste ses droits, dépose un fichier Markdown, DOCX ou PDF, puis l’API authentifiée contrôle le rôle, le feature flag, le type et la taille du fichier. Le pipeline conserve le fichier dans un chemin privé lié au propriétaire et persiste le verdict du validateur.

Un canevas conforme est transformé en `ClassroomPlan`, puis ouvert dans l’`OutlinesEditor` natif. Après modification et confirmation de l’auteur, le parcours de génération existant réutilise le `courseId` et le `sourceManifestId` persistés. Le même cours importé passe de `draft` à `ready` sans perdre `source_kind=imported`, son `import_id` ni son manifeste de sources immuable.

Le parcours Playwright permanent `e2e/tests/course-canvas-import.spec.ts` vérifie le dépôt, la validation, l’édition réelle du titre, l’envoi du plan modifié, la génération réussie et l’arrivée dans la classroom.

## Parsing PDF partagé

L’import ne possède pas un second routeur PDF. `lib/server/pdf-document-extraction.ts` porte le comportement commun déjà exposé par `/api/parse-pdf` : validation de l’URL, sélection du provider et repli de l’extraction locale `unpdf` vers MinerU ou MinerU Cloud lorsque le texte est illisible. Le test `tests/server/course-import-document.test.ts` prouve que l’import PDF délègue au provider MinerU existant.

## Fermeture contrôlée du feature flag

La migration `00046_import_pipeline_flag.sql` provisionne `import_pipeline=false`. C’est un fail-closed volontaire : le contrôle d’import, y compris son input caché, n’est pas rendu tant que les prérequis juridiques de conservation ne sont pas approuvés. Le parcours activé est couvert par Playwright en environnement de validation ; aucune activation publique n’est revendiquée par cette story technique.

## Validation ServeurIA

Le gate a été exécuté dans le worktree isolé `/tmp/qalem-s6013-155f9b3`, avec l’image `qalem-validation:playwright-1.58.2-ffmpeg` et `NODE_OPTIONS=--max-old-space-size=6144`.

- ciblage import et bibliothèque de sources : 15/15 Playwright ;
- Prettier, TypeScript et ESLint : verts ;
- Vitest : 385/385 fichiers et 2 505/2 505 tests ;
- build Next.js : 100/100 pages générées ;
- Playwright complet : 83/83 tests en 3,6 minutes.

Journal : `/tmp/qalem-s1005-full-gate-d7f570e.log`

SHA-256 : `77d98a4b43dfca7335867accb4de1760c86f32a51e296476c3fee62a3591f132`
