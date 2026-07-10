# AGENTS.md — Qalem

## RÈGLE CARRIÈRE — `main` est figée, lecture seule (depuis S0-010, 2026-07-11)

**`main` (`C:\projets\Qalem\OpenMAIC`) est la carrière v0.1.0. Elle est GELÉE définitivement.**

- Tag annoté `legacy-v010-final` posé et poussé sur `origin/main`, sur le commit `a4c8421695820e63be585e166d7ed35829d13369` (« fix: rename middleware export to proxy (Next.js 16) »). Ce tag matérialise le gel : c'est la dernière trace de vérité de l'ancienne base.
- **Aucun commit, aucun merge, aucun push de branche ne doit plus jamais toucher `main`** — la SEULE exception jamais tolérée est l'ajout d'un futur tag (jamais un commit, jamais un changement de contenu).
- `main` reste consultable en lecture (source de portage via `git show main:<path>`, cf. FR-1) mais plus jamais modifiable. Toute divergence entre `main` et `origin/main` détectée par un agent doit être signalée à Amine, jamais corrigée silencieusement.
- Les fichiers non commités pré-existants sur `main` (hérités d'avant ce Ralph loop) ne doivent JAMAIS être touchés, commités ou stashés par un agent — ils font partie de l'état gelé constaté, pas du travail en cours.
- Toute évolution future du produit vit exclusivement sur `refork-v030` (ce worktree) puis, une fois S0-008 débloqué, sur les branches des chantiers 1-3 qui en dépendent.

## Agent principal

- **Rôle** : Implémente les user stories du PRD Qalem selon le Ralph Loop
- **Stack** : Next.js 16 + React 19 + TypeScript 5 + Tailwind 4 + Zustand + LangGraph + AI SDK + Supabase
- **Règles** :
  - Sur la branche `refork-v030` : lire `.ralph/prd-v2.json` (PAS `prd.json`, v1 soldé/archivé) + `.ralph/progress.md` avant chaque itération
  - Une seule story par itération
  - Suivre les patterns dans "Codebase Patterns" de progress.md
  - Typecheck + lint + test + e2e avant de marquer passes=true
  - Commit format : `[S-XXX] Titre exact de la story`
  - Ne jamais modifier hors scope de la story courante
  - Stories `[CHECKPOINT AMINE]` : produire l'artefact demandé, ne JAMAIS marquer `passes: true` soi-même — fermeture uniquement sur tranche d'Amine consignée

## RÈGLE IMPÉRATIVE — Exécution jamais en local (depuis le 2026-07-10)

**Aucune commande d'exécution (pnpm install/build/dev, npx tsc, lint, test, e2e, ou tout ce qui ouvre un navigateur/serveur) ne doit tourner sur le poste Windows local d'Amine.** Seuls l'édition de fichiers (Read/Edit/Write) et git (commit/push/fetch) sont autorisés en local.

Toute exécution se fait sur `serveuria` via SSH :
- Workspace : `~/qalem-refork-v030` (clone HTTPS public du repo, `git pull` après chaque push local)
- Conteneur persistant : `qalem-refork-exec` (image `mcr.microsoft.com/playwright:v1.58.2-noble`, `corepack prepare pnpm@10.28.0 --activate`), accédé via `docker exec`
- Accès : `ssh -i ~/.ssh/serveurai_mnemo -o BatchMode=yes serveuria@$env:SERVER_HOST '<commande>'`
- Flux : édition locale → commit + push (sans passes=true) → pull + validation sur serveuria → si vert, nouveau commit local passes=true + push

**Interdiction stricte** : `claude-in-chrome`, Playwright en mode headed, ou tout outil pilotant un navigateur visible — la vérification visuelle réelle est un jalon humain explicite (stories `[CHECKPOINT AMINE]`, ex. S0-012), jamais un sous-agent.

## Quality Gates (à exécuter sur serveuria, jamais en local)

```bash
npx tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e
```

## Conventions spécifiques Qalem

- **i18n** : toute nouvelle string UI doit passer par `t()` dans les 3 locales (fr-FR, ar-MA, en-US)
- **TTS** : tout nouveau provider doit implémenter `generateXxxTTS()` dans `tts-providers.ts` + entry dans `constants.ts`
- **Supabase** : RLS activé sur chaque nouvelle table, policies testées
- **Accents FR** : majuscules accentuées obligatoires (É, È, À, Ç, etc.)
- **RTL** : tout nouveau composant UI doit être testé en ar-MA
