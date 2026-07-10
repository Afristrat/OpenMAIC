# AGENTS.md — Qalem

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
