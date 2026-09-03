# S6-006 — Ancrage documentaire des scènes

## Recertification du 3 septembre 2026

Le SHA fonctionnel déployé `9935016ced2aedbc4a633eeec4179c449952a002`
utilise un seul contrat `SceneSourceGrounding` du plan à la scène, au contenu,
à la narration et aux régénérations. La sélection est bornée à quatre passages
pertinents par scène, avec identifiant et version stables ; elle n’injecte pas
aveuglément tous les documents.

Les états `grounded`, `unsupported` et `contradictory` sont persistés. Les
passages restent visibles pour l’auteur et sont retirés de la vue apprenant.
Le même chemin accepte une source unique ou un manifeste multi-source sans
logique concurrente.

Sur ServeurIA :

- 38/38 tests ciblés couvrent information absente du résumé, document hors
  sujet, contradictions entre versions, plan→contenu→narration→persistance,
  régénération et contrôle d’accès ;
- le parcours Chromium `scene-source-grounding` passe 1/1 et affiche la version,
  l’identifiant et l’extrait exacts à l’auteur ;
- journaux SHA-256 :
  `fb8630f1b360abb95835322b0fab64956a8c70581b1e15a6a00462ca87e64543`
  pour Vitest et
  `9e2643fd967ca6393692035f32c1d150ac23340df636458655c37e1450abf154`
  pour Playwright.

Le gate complet du même graphe passe Prettier, TypeScript, ESLint, 420 fichiers
et 2 640 tests Vitest, le build Next.js de 107 routes et 105 tests Playwright
sur 105.
