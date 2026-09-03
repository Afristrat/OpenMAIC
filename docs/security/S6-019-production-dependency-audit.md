# S6-019 — Audit des dépendances de production

## Recertification du 3 septembre 2026

Un audit frais du lockfile courant a d’abord invalidé l’ancienne clôture : 11
avis uniques étaient réapparus, soit 1 faible, 4 modérés, 6 hauts et 0 critique.
Ils provenaient de cinq chaînes transitives seulement.

| Paquet | Appelant | Version vulnérable | Version corrigée |
| --- | --- | ---: | ---: |
| `postcss-selector-parser` | `shadcn` | 7.1.1 | 7.1.3 |
| `browserslist` | Sentry/Babel | 4.28.1 | 4.28.7 |
| `qs` | SDK MCP/Express | 6.15.3 | 6.16.0 |
| `@xmldom/xmldom` | importeur et `mathml-to-latex` | 0.8.13 et 0.9.10 | 0.8.15 et 0.9.12 |
| `fast-uri` | SDK MCP/AJV | 3.1.5 | 3.1.6 |

Le commit `9935016ced2aedbc4a633eeec4179c449952a002` borne ces
correctifs dans leurs branches majeures, sans ajout de dépendance, exclusion ni
acceptation de risque. L’audit ServeurIA final porte sur 1 232 dépendances de
production et retourne exactement 0 information, 0 faible, 0 modérée, 0 haute
et 0 critique. Le JSON exact a pour SHA-256
`350381e5c20e7f44c5a51468504bd9f5501551f62d3691b8fd9cc6e2ff0a1474`.

La porte qualité du même graphe est intégralement verte : Prettier, TypeScript,
ESLint, 420/420 fichiers et 2 640/2 640 tests Vitest, build Next.js de 107
routes et 105/105 tests Playwright. Les déploiements Coolify web
`thiqhhb8prnpwgfblhzmwqmy` et runtime `wgis2h4x6w3siwwtinrz7r70`
sont terminés sur le SHA exact. Les trois conteneurs sont healthy, sans
redémarrage ni OOM ; le volume capture est persistant et RW, worker→capture
répond 200, tout comme `/`, `/api/health` et `/api/server-providers`.

## Certification initiale du 27 août 2026

Le SHA fonctionnel `0cf0d94e6b40538e378e22b2bec928464ceb8def` passe
`pnpm audit --prod` avec **1 231 dépendances de production** et exactement :

- 0 information ;
- 0 faible ;
- 0 modérée ;
- 0 haute ;
- 0 critique.

Le script `audit:prod` exécute désormais l’audit sans seuil : toute vulnérabilité
future, même faible, fait échouer la commande. Aucune exclusion, désactivation ou
acceptation de risque n’a été ajoutée.

## Inventaire réconcilié

L’état de départ est l’audit de production du SHA
`a9f26a30a74b6ed868c77d474f7ae8c2ee6b2f71` : 12 paquets, 20 avis uniques et
22 occurrences, soit 17 modérées et 5 faibles. Une occurrence désigne ici un couple
avis/version/chemin remonté par l’audit ; un même paquet peut donc porter plusieurs
avis ou plusieurs versions atteintes.

| Paquet              | Avis GitHub                                                                                                                                                                                                                                                                                                                                                                      | Occ. | Version(s) atteinte(s)          | Appelant Qalem                                  | Correction et état final                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@babel/core`       | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8)                                                                                                                                                                                                                                                                                                         |    1 | 7.29.0                          | Sentry                                          | Sentry 10.71.0 et plancher 7.29.7 ; résolu en 7.29.7.                                                                         |
| `@hono/node-server` | [GHSA-92pp-h63x-v22m](https://github.com/advisories/GHSA-92pp-h63x-v22m), [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9)                                                                                                                                                                                                                               |    2 | 1.19.11                         | SDK MCP                                         | SDK MCP 1.30.0 et plancher 1.19.15 ; résolu en 1.19.15.                                                                       |
| `body-parser`       | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6)                                                                                                                                                                                                                                                                                                         |    1 | 2.2.2                           | SDK MCP → Express                               | Plancher 2.3.0 ; résolu en 2.3.0.                                                                                             |
| `dompurify`         | [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4), [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7)                                                                                                                                                                                                                               |    2 | 3.4.11                          | Streamdown → Mermaid                            | Streamdown 2.6.0 ne tire plus ce sous-graphe de production ; occurrence absente.                                              |
| `echarts`           | [GHSA-fgmj-fm8m-jvvx](https://github.com/advisories/GHSA-fgmj-fm8m-jvvx)                                                                                                                                                                                                                                                                                                         |    1 | 6.0.0                           | dépendance directe et pair du renderer          | Dépendance directe et contrat pair portés à 6.1.0 ; résolu en 6.1.0.                                                          |
| `esbuild`           | [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)                                                                                                                                                                                                                                                                                                         |    1 | 0.27.7                          | Sentry → minimiseur webpack                     | Plancher 0.28.2 ; résolu en 0.28.2.                                                                                           |
| `mermaid`           | [GHSA-c4c3-pg64-4m4v](https://github.com/advisories/GHSA-c4c3-pg64-4m4v), [GHSA-6x64-9x62-f2gx](https://github.com/advisories/GHSA-6x64-9x62-f2gx), [GHSA-3rrr-jr9j-h3q3](https://github.com/advisories/GHSA-3rrr-jr9j-h3q3), [GHSA-2v8p-3f2j-5mp7](https://github.com/advisories/GHSA-2v8p-3f2j-5mp7), [GHSA-rhh3-jpg6-66xh](https://github.com/advisories/GHSA-rhh3-jpg6-66xh) |    5 | 11.15.0                         | Streamdown                                      | Streamdown 2.6.0 ne tire plus Mermaid dans le graphe de production ; occurrence absente.                                      |
| `protobufjs`        | [GHSA-j3f2-48v5-ccww](https://github.com/advisories/GHSA-j3f2-48v5-ccww)                                                                                                                                                                                                                                                                                                         |    1 | 7.6.4                           | Pi AI → Google GenAI                            | Plancher correctif dans la même majeure ; résolu en 7.6.5.                                                                    |
| `qs`                | [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p), [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26)                                                                                                                                                                                                                               |    2 | 6.5.5 et 6.15.0                 | ancien `request` et SDK MCP → Express           | Ancien chemin supprimé ; chemin MCP résolu en 6.15.3.                                                                         |
| `request`           | [GHSA-p8p7-x288-28g6](https://github.com/advisories/GHSA-p8p7-x288-28g6)                                                                                                                                                                                                                                                                                                         |    1 | 2.88.2, aucune version corrigée | importeur → `omml2mathml` → `get-dom` → `jsdom` | Sous-graphe retiré à la racine par le fork interne maintenu ; paquet absent de la production.                                 |
| `tough-cookie`      | [GHSA-72xf-g2v4-qvf3](https://github.com/advisories/GHSA-72xf-g2v4-qvf3)                                                                                                                                                                                                                                                                                                         |    1 | 2.5.0                           | ancien `get-dom` → `jsdom`                      | Occurrence 2.5.0 supprimée avec l’ancien DOM. La version 6.0.0 éventuellement présente ailleurs est corrigée.                 |
| `uuid`              | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) — deux identifiants npm                                                                                                                                                                                                                                                                                 |    4 | 3.4.0, 10.0.0, 11.1.0 et 13.0.0 | ancien `request`, LangChain et LangGraph SDK    | Ancien chemin supprimé ; LangChain 1.2.9 et LangGraph 1.4.13 n’embarquent plus ces versions. Aucune occurrence de production. |

## Correction de la frontière OMML

`omml2mathml` 1.3.0 était resté inchangé depuis 2017 et créait son DOM au moyen de
`get-dom` 9, lequel chargeait `jsdom` 9 puis `request` 2.88.2. Comme `request` ne
possède aucune version corrigée, un override aurait seulement masqué la cause.

Qalem porte désormais `@openmaic/omml2mathml`, fork interne Apache-2.0 attribué :

- les règles de transformation OMML → MathML d’origine sont conservées ;
- `DOMImplementation` provient de `@xmldom/xmldom`, déjà utilisé par l’importeur ;
- l’échappement de l’expression des opérateurs utilise JavaScript sans dépendance ;
- `get-dom`, l’ancien `jsdom`, `request`, `uuid` 3 et `tough-cookie` 2 disparaissent
  du graphe de production ;
- le fallback JavaScript reste actif lorsque l’endpoint TexMath n’est pas joignable.

Les tests permanents de `mathSerializer` couvrent désormais sept structures OMML
valides : fraction, radical, indice/exposant, matrice, opérateur n-aire, dérivée
partielle et nabla. Le build de l’importeur produit les trois formats UMD, CommonJS
et ESM sans avertissement TypeScript.

## Frontières revalidées

- **MCP** : SDK 1.30.0, Hono 1.19.15, Express avec `body-parser` 2.3.0 et `qs` 6.15.3.
- **Markdown** : Streamdown 2.6.0 et parcours E2E de rendu inchangés ; Mermaid et
  DOMPurify vulnérables ne sont plus dans le graphe de production.
- **Graphiques** : ECharts 6.1.0 est aligné entre l’application et le contrat pair du renderer.
- **Sentry** : 10.71.0 avec Babel 7.29.7 et esbuild 0.28.2.
- **Google GenAI** : `protobufjs` 7.6.5 dans le contrat majeur existant.
- **LangChain** : Core 1.2.9 et LangGraph 1.4.13, sans les versions `uuid` atteintes.
- **Runtime et outils de build** : Next.js 16.3.3, Sharp 0.35.4, Vite 8.2.2 et
  Vitest 4.1.11. Les 18 overrides restants ont tous été vérifiés dans la plage
  majeure déclarée par leur sélecteur ; aucun override inter-majeure ne subsiste.
- **Import PPTX/OMML** : sept tests ciblés, build de l’importeur, suite Vitest globale,
  build Next.js et E2E complets. `pdfjs-dist` est chargé à la demande uniquement
  pour le chemin PDF embarqué dans un EMF : les tests de l’importeur ne chargent
  plus inutilement les polyfills DOM côté Node.js.

## Preuves machine au SHA exact

Exécution isolée sur ServeurIA au SHA
`0cf0d94e6b40538e378e22b2bec928464ceb8def` :

- installation figée par `pnpm install --frozen-lockfile` ;
- `pnpm audit:prod` : aucune vulnérabilité connue ;
- `pnpm check` : vert ;
- `pnpm exec tsc --noEmit` : vert ;
- `pnpm lint` : vert ;
- `pnpm test` : 376 fichiers et 2 474 tests verts ;
- `pnpm --filter @openmaic/importer test` : 10 fichiers et 31 tests verts, sans
  avertissement `DOMMatrix` ou `Path2D` ;
- `pnpm build` : compilation et 99 pages statiques sur 99 ;
- `pnpm test:e2e` : 82 tests sur 82 verts, sans retry.

Journal de certification serveur :
`/tmp/qalem-s6019-final-0cf0d94/s6019-0cf0d94-gate.log`. Résultat structuré de
l’audit : `/tmp/qalem-s6019-final-0cf0d94/s6019-0cf0d94-audit.json`.

## Déploiement de production

Deux déploiements Coolify ont été terminés sur le SHA fonctionnel exact :

- web `gvshnq1m02nmqatnbx9dgi0y` ;
- runtime durable `irkisgmudkfy9fc8p82iq6b8`.

Après remplacement :

- web `1fd349d1068e` : healthy, zéro redémarrage, `OOMKilled=false`, 1,5 Gio de
  mémoire et 3 Gio mémoire+swap ;
- worker de génération `b631f0a8c9a3` : healthy, zéro redémarrage,
  `OOMKilled=false`, 3 Gio de mémoire et 6 Gio mémoire+swap ;
- capture-worker du runtime `07f741b5f3e7` : healthy, zéro redémarrage,
  `OOMKilled=false`, 1,5 Gio de mémoire et 3 Gio mémoire+swap ; volume nommé
  persistant monté en lecture-écriture sur `/data/storage-states` ;
- aucun second capture-worker autonome ou résiduel n’est présent : l’inventaire
  Docker complet ne contient que le service du runtime ci-dessus.

Le worker atteint son capture-worker interne en HTTP 200 avec `ok=true`. Après les
deux déploiements, `https://qalem.ma/api/health` répond HTTP 200 avec `status=ok`
et les quatre capacités webSearch, imageGeneration, videoGeneration et tts actives.
Au contrôle post-déploiement, les consommations étaient respectivement de 97,71 Mio,
195,8 Mio et 105,3 Mio, très en dessous des plafonds configurés.
