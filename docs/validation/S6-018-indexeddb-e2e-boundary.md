# S6-018 — Frontière E2E du fallback IndexedDB

## Recertification du 3 septembre 2026

Le SHA fonctionnel déployé `9935016ced2aedbc4a633eeec4179c449952a002`
conserve la frontière déterministe décrite ci-dessous. Le ciblage frais sur
ServeurIA couvre catalogue, plug-ins en fr-FR/ar-MA/en-US, équipe du jour en
fr-FR/ar-MA et PWA : 11 tests sur 11 passent. Le journal
`/tmp/qalem-s6-018-20260903.log`, SHA-256
`9b1a7b06738983cd04bb5908524cd4a70a8ad25913d45c9add1d6a097cd83aab`,
contient zéro occurrence de `Classroom retrieval failed`, `[SW] Registration
failed`, `Failed to fetch server providers` et `flaky`.

Le gate complet du même graphe passe également Prettier, TypeScript, ESLint,
420 fichiers et 2 640 tests Vitest, le build Next.js de 107 routes et 105 tests
Playwright sur 105. Aucun filtre, silence global ou modification du chemin de
production n’a été ajouté.

## Certification initiale

Date de validation : 27 août 2026  
SHA fonctionnel validé : `7f589d69ce1f4bd3607f56a6b254d4f04508f64c`

## Cause racine

`plugin-classroom.spec.ts` et les deux variantes de `team-of-the-day.spec.ts` semaient une classroom uniquement dans IndexedDB. Le client chargeait correctement cette copie locale, puis interrogeait `/api/classroom?id=…` pour rechercher une version serveur. En l’absence de fixture réseau, la requête atteignait la fausse configuration Supabase du harnais et produisait une erreur serveur avant le fallback local attendu.

## Correction

- `mockLocalClassroomFallback(stageId)` intercepte le parent commun `/api/classroom?*`.
- Seule la requête `GET` portant exactement l’identifiant attendu reçoit une réponse `404` déterministe, qui exprime l’absence volontaire de copie serveur.
- Toute autre requête est enregistrée comme inattendue puis interrompue.
- Les tests conservent leur amorçage IndexedDB et vérifient qu’au moins une requête attendue a eu lieu, que l’ensemble des URL observées ne contient que l’URL exacte et qu’aucune requête inattendue n’est apparue. Cette forme tolère le double effet de React en mode strict sans assouplir le contrat réseau.
- Aucun filtre global de `console`, `stderr` ou du logger n’a été ajouté.

Le harnais Playwright bloque les service workers par défaut afin que `page.route()` reste autoritaire. Le composant d’enregistrement évite donc uniquement l’enregistrement automatique lorsque `NEXT_PUBLIC_E2E_TEST_MODE=true`. Le scénario PWA, qui autorise explicitement les service workers, enregistre lui-même `/sw.js` avant de tester son cycle de vie. Le chemin de production reste inchangé lorsque ce drapeau E2E est absent.

## Preuves

Exécution ciblée sur ServeurIA, clone isolé au SHA exact et port `3012` :

```text
pnpm exec playwright test \
  e2e/tests/pwa-review-reminders.spec.ts \
  e2e/tests/plugin-classroom.spec.ts \
  e2e/tests/team-of-the-day.spec.ts \
  e2e/tests/catalog-content.spec.ts

8 passed (34.4s)
```

Gate complet sur ServeurIA, image `qalem-s6017-gate:ffmpeg`, journal `/tmp/qalem-gate-logs/s6018-7f589d-full-gate.log` :

```text
pnpm check && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build && pnpm test:e2e

Prettier : vert
TypeScript : vert
ESLint : vert
Vitest : 376 fichiers, 2 474 tests passés
Build Next.js : 99 pages statiques générées sur 99
Playwright : 82 tests passés sur 82, zéro échec, zéro flaky
```

Analyse littérale du journal complet :

```text
Classroom retrieval failed = 0
[SW] Registration failed = 0
Failed to fetch server providers = 0
flaky = 0
résumé E2E en échec = 0
```

Le SHA du clone, le SHA distant `origin/refork-v030` et le SHA fonctionnel validé étaient identiques. Aucun déploiement de production n’était requis : les changements portent sur les fixtures et scénarios E2E ; la seule branche du composant applicatif ajoutée est conditionnée au drapeau explicite du harnais, absent de la construction de production.
