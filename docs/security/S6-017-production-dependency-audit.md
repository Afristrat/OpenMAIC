# S6-017 — Audit des dépendances de production

## Recertification du 3 septembre 2026

Le commit fonctionnel `9935016ced2aedbc4a633eeec4179c449952a002` corrige
les six avis hauts réapparus depuis la certification initiale : deux avis
`browserslist` et quatre avis `fast-uri`. Les deux versions restent dans le
contrat majeur de leurs appelants : `browserslist` 4.28.7 et `fast-uri` 3.1.6.

L’audit frais exécuté sur ServeurIA contient 1 232 dépendances de production et
zéro avis à tous les niveaux. Son fichier JSON a pour SHA-256
`350381e5c20e7f44c5a51468504bd9f5501551f62d3691b8fd9cc6e2ff0a1474`.
`web-push` 3.6.7 reste installé, absent des avis et couvert par ses tests
unitaires, sa migration RLS et les parcours PWA du gate complet.

Le même SHA passe Prettier, TypeScript, ESLint, 420 fichiers et 2 640 tests
Vitest, le build Next.js de 107 routes et 105 tests Playwright. Les déploiements
Coolify web `thiqhhb8prnpwgfblhzmwqmy` et runtime
`wgis2h4x6w3siwwtinrz7r70` sont terminés sur ce SHA. Web, worker et
capture-worker sont healthy, avec zéro redémarrage et `OOMKilled=false`.

## Certification initiale du 27 août 2026

Audit exécuté le 27 août 2026 sur ServeurIA, dans un clone isolé au commit
`a9f26a30a74b6ed868c77d474f7ae8c2ee6b2f71` :

```text
pnpm audit --prod --json
```

| Mesure | Avant (`e59eb8a`) | Après (`a9f26a3`) |
|---|---:|---:|
| Dépendances de production | 1 650 | 1 380 |
| Occurrences critiques | 2 | 0 |
| Occurrences hautes | 88 | 0 |
| Occurrences modérées | 126 | 17 |
| Occurrences faibles | 16 | 5 |

Le seuil permanent `pnpm audit:prod` échoue dès qu’un avis haut ou critique
réapparaît. Les 17 avis modérés et 5 faibles ne sont pas déclarés résolus par
S6-017.

## Inventaire critique et haut

La colonne « Atteignabilité » décrit le chemin Qalem réel au moment de l’audit,
avant correction.

| Paquet | Version(s) vulnérable(s) | Nature et appelant Qalem | Atteignabilité | Correction effective |
|---|---|---|---|---|
| `@langchain/core` | 0.1.63, 0.2.36 | Transitif de `@copilotkit/backend` | Inatteignable : aucune importation CopilotKit dans le code | Retrait de `@copilotkit/backend` |
| `axios` | 0.21.4, 1.13.6 | Transitif de l’ancien LangChain et de `copilotkit` | Inatteignable : trois dépendances CopilotKit inutilisées | Retrait complet du sous-graphe CopilotKit |
| `brace-expansion` | 2.0.2, 5.0.4 | Transitif de Sentry et de l’outillage CopilotKit | Atteignable pendant le build Sentry | Override borné vers 5.0.9 ; l’ancienne branche CopilotKit est retirée |
| `expr-eval` | 2.0.2 | Transitif de `@langchain/community` via CopilotKit | Inatteignable | Retrait de `@copilotkit/backend` |
| `fast-uri` | 3.1.0 | Transitif d’AJV via le SDK MCP | Atteignable lors de la validation d’URI MCP | Override borné vers 3.1.5 |
| `form-data` | 2.3.3, 4.0.5 | Transitif de l’importeur OMML, de l’ancien SDK OpenAI et de LangChain | Atteignable par le fallback d’import OMML ; les deux autres appelants étaient inutilisés | Overrides bornés vers 2.5.6 et 4.0.6, retrait des SDK inutilisés |
| `hono` | 4.12.7 | Transitif du SDK MCP et de CopilotKit Runtime | Atteignable par le serveur MCP | Override borné vers 4.13.5 et retrait de CopilotKit Runtime |
| `image-size` | 1.2.1 | Dépendance du fork `pptxgenjs` | Inatteignable : l’unique appel est dans un bloc commenté | Dépendance et alias navigateur supprimés |
| `ip-address` | 10.1.0 | Transitif du limiteur Express du SDK MCP | Atteignable par la frontière réseau MCP | Override borné vers 10.5.0 |
| `js-yaml` | 4.1.1 | Dépendance directe | Atteignable lors du chargement de la configuration serveur et MCP | Mise à niveau vers 4.3.1 |
| `langchain` | 0.1.37 | Transitif de `@copilotkit/backend` | Inatteignable | Retrait de `@copilotkit/backend` |
| `langsmith` | 0.1.68, 0.3.87, 0.5.9 | Transitif de LangChain/CopilotKit et de `@langchain/core` | Atteignable par le LangChain actuel | Retrait des anciennes branches et override borné vers 0.6.0 |
| `lodash` | 4.17.23 | Dépendance directe de l’éditeur | Atteignable par les opérations de texte et d’édition | Mise à niveau vers 4.18.1 |
| `nanoid` | 3.3.11, 5.1.14, 5.1.6 | Dépendance directe et transitive de Next/importeur | Atteignable lors de la création d’identifiants | Mise à niveau directe vers 5.1.16 et overrides 3.3.18/5.1.16 |
| `next` | 16.1.2 | Dépendance directe, runtime web | Atteignable sur toute requête | Mise à niveau coordonnée de Next et `eslint-config-next` vers 16.2.11 |
| `path-to-regexp` | 0.1.12, 8.3.0 | Transitif des serveurs Express MCP/CopilotKit | Atteignable par les routes MCP ; l’ancienne branche CopilotKit était inutilisée | Override 8.4.2 et retrait de CopilotKit |
| `picomatch` | 2.3.1, 4.0.3 | Transitif de Shadcn et du bundler Sentry | Atteignable pendant le build | Overrides bornés vers 2.3.2 et 4.0.7 |
| `postcss` | 8.4.31, 8.5.8 | Transitif de Next et Shadcn | Atteignable pendant la compilation CSS | Override borné vers 8.5.26 |
| `sharp` | 0.34.5 | Dépendance directe et transitive de Next | Atteignable sur les médias, PDF, exports et marques visuelles | Mise à niveau et override vers 0.35.4 |
| `tar` | 6.1.13 | Transitif de la CLI `copilotkit` | Inatteignable : CLI jamais appelée | Retrait de `copilotkit` |
| `undici` | 7.22.0 | Dépendance directe du proxy HTTP | Atteignable sur les appels sortants proxifiés | Mise à niveau vers 7.29.0 |
| `ws` | 8.19.0 | Transitif de LangChain/CopilotKit et de `pi-ai` | Atteignable par les fournisseurs utilisant WebSocket | Retrait des anciennes branches et override vers 8.21.3 |

## Web Push et non-régression

`web-push` reste verrouillé en version 3.6.7. Le JSON d’audit exact contient
zéro occurrence de la chaîne `web-push`. Le gate au même SHA couvre en plus la
migration RLS, l’envoi VAPID, le service worker et les parcours PWA permanents.

Le gate complet a terminé avec 2 474 tests Vitest sur 2 474, 99 pages sur 99 au
build et 82 tests Playwright sur 82. Les trois traces serveur inattendues des
E2E IndexedDB sont inchangées et suivies par S6-018 ; elles ne proviennent pas
de la montée de dépendances.
