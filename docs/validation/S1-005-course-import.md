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

## Recertification de production du 24 septembre 2026

Le runtime worker déployé par Coolify sert le SHA
`9958b960f7a7a5be839cb275bd36a7b7c80a6040`. Son conteneur est `healthy`,
sans redémarrage ni OOM. Le harnais permanent final est au SHA
`4255e9f524fde3aab584175b704d4fd602759b77`.

La recette `scripts/validation/s1-005-production-import-recipe.mjs` crée un
compte auteur et un tenant éphémères, active l'import pendant le seul dépôt,
importe un vrai fichier Markdown, vérifie le verdict `conform` et la langue
`fr-FR`, modifie le titre dans l'éditeur natif puis lance la génération
asynchrone avec `learningApproach=andragogy`. La relecture finale prouve :

- import HTTP 201 et deux sections importées ;
- titre modifié persisté dans le cours et dans son plan ;
- cours `ready`, classe persistée et deux scènes relues par l'API ;
- zéro erreur console ou navigateur ;
- drapeau `import_pipeline` restauré à `false` ;
- zéro résidu dans les organisations, adhésions, cours, imports, travaux et
  classes, ainsi que suppression du compte temporaire.

La recette a également reproduit la panne de génération historique. Higgs
renvoyait de grands WAV valides, mais `ffprobe` pouvait fermer son entrée avant
la fin de l'écriture et provoquer `EPIPE`. La durée des WAV RIFF est désormais
calculée directement depuis les chunks `fmt` et `data`; `ffprobe` demeure le
repli pour les formats compressés. Une génération complète produit toutes ses
pistes audio sans reprise du worker, sans redémarrage et sans OOM. Les reprises
BullMQ disposent en outre d'une clé de facturation distincte par tentative.

Le parsing PDF reste délégué au fournisseur existant par le même pipeline ; sa
couverture permanente est incluse dans la suite complète.

### Gate complète finale

Sur ServeurIA, au SHA `4255e9f524fde3aab584175b704d4fd602759b77` :

- Prettier, TypeScript et ESLint : zéro erreur et zéro avertissement ;
- Vitest : 3 369/3 369 tests ;
- build Next.js et contrôle d'isolation des routes : réussis ;
- Playwright : 196/196 scénarios, sans échec.

Journal : `/tmp/qalem-s1005-full-gate-4255e9f.log`

SHA-256 : `ba79c5fa982efc4c01ff679f4ff93f66a6e51031c3001d59eb1fb6acfe59501f`
