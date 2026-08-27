# S6-020 — Gate silencieux

Date de validation : 27 août 2026  
SHA fonctionnel validé : `74fb1055cd76790061131ef6a26beb13846b4958`  
Environnement : clone isolé `/tmp/qalem-s6018-c68c260` sur ServeurIA, image Docker `qalem-s6017-gate:ffmpeg`  
Journal final persistant : `/tmp/qalem-gate-logs/s6020-74fb105-full-gate.log`

## État initial inventorié

Le gate de référence S6-018 au SHA `7f589d69ce1f4bd3607f56a6b254d4f04508f64c` était fonctionnellement vert, mais son journal `/tmp/qalem-gate-logs/s6018-7f589d-full-gate.log` contenait :

- 53 blocs `stderr` Vitest ;
- 64 lignes `WARN` et 17 lignes `ERROR` émises par les loggers applicatifs ;
- 6 avertissements du middleware de persistance Zustand ;
- 54 collisions de clé React `scene-0` ;
- 1 mismatch d’hydratation serveur/client ;
- des erreurs et avertissements navigateur provenant des scénarios ASR négatifs, de lectures StageStore absentes, du plan de génération et de synchronisations Quiz.

Chaque occurrence a été rattachée à l’une des classes suivantes :

| Classe | Émetteurs ou scénarios | Verdict et traitement |
|---|---|---|
| Chemins négatifs Vitest attendus | Transcription, AudioPlayer, StageStore, génération JSON/PBL/quiz/plugin/vidéo, WebCapturePlan, PromptLoader, CaptureClient, ClassroomMedia, QuizSync, export PPTX | Contrat local exact avec `tests/helpers/expected-console.ts`. L’espion appartient au seul test négatif, compare le nombre et le contenu normalisé, puis est restauré via `onTestFinished`. |
| Harnais de store incomplet | `agent-thread-store.test.ts` | `localStorage` et `window.localStorage` déterministes installés avant l’import du store ; zéro avertissement Zustand. |
| Erreurs HTTP ou applicatives E2E attendues | ASR refusé/indisponible, feature flag vidéo, job de génération invalide, ressources locales absentes | Déclarations exactes par scénario dans la fixture ; méthode, URL, statut et message doivent tous correspondre. Aucun filtrage par sous-chaîne globale. |
| Réseau E2E accidentel | Classroom, révisions Supabase, plan auteur, compte et organisation | Routes communes bornées et assertions sur toute requête divergente ; `HEAD` Supabase et fallback IndexedDB simulés conformément aux contrats réels. |
| Défauts React et de fixture | identifiants `scene-0`, rendu de layout, iframe interactive | Identifiants uniques et stables, suppression du `Suspense` inutile, initialisation limitée au frame principal et rendu serveur/client identique. |
| Sandbox iframe | plugins et contenus interactifs | Suppression de `allow-same-origin`, URL vide neutralisée, `postMessage` compatible avec l’origine opaque et service worker Playwright autorisé uniquement dans les suites où son blocage injecté provoquait lui-même une erreur. |
| Absence locale normale | StageStore sans donnée IndexedDB | Niveau ramené de `WARN` à `INFO` au point d’émission : l’absence initiale n’est pas une panne. |
| Suppression globale du build | `withSentryConfig({ silent: true })` | Option supprimée. Les diagnostics Sentry du build sont de nouveau visibles ; l’upload des sourcemaps demeure explicitement désactivé. |

Les anciennes suppressions locales non vérifiées de `stage-mode`, `svg-path-parser` et `review-reminders` ont également été remplacées par des attentes exactes. La seule interception restante de `console.warn`/`console.error` dans le produit appartient au bac à sable pédagogique : elle capture la console du code apprenant pendant son exécution et restaure les fonctions dans un `finally` ; elle ne masque pas le gate.

## Contrôle permanent

`e2e/fixtures/base.ts` installe automatiquement le contrat navigateur sur chaque test utilisant la fixture commune. Il échoue sur :

- tout `console.warn`, `console.error` ou `pageerror` non déclaré localement ;
- toute réponse HTTP en erreur non déclarée avec sa méthode, son URL et son statut exacts ;
- toute erreur applicative capturée après l’hydratation qui n’a pas été consommée par le scénario.

`e2e/fixtures/expected-console.ts` garantit que les attentes déclarées ont réellement été observées. Il n’existe ni allowlist globale, ni désactivation de la console, de `stderr`, du logger ou des avertissements React.

## Gate exact final

Commande exécutée :

```text
pnpm check && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Résultat terminal : code de sortie `0`.

- Prettier : conforme sur tout le dépôt ;
- TypeScript : zéro erreur ;
- lint : zéro erreur et zéro avertissement ;
- Vitest : 376/376 fichiers, 2 474/2 474 tests ;
- build Next.js : réussi, 99/99 pages statiques ;
- Playwright : 82/82 scénarios en 3,9 minutes, zéro retry et zéro flaky ;
- journal : zéro bloc `stderr`, zéro `[WARN]`, zéro `[ERROR]`, zéro avertissement Zustand, zéro collision de clé React et zéro mismatch d’hydratation.

Les seules occurrences lexicales de « error » ou « retry » restantes dans le journal final sont des noms de tests négatifs ; elles ne sont accompagnées d’aucune émission de console ou de `stderr`.
