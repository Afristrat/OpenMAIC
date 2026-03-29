# AGENTS.md — Qalem

## Agent principal

- **Rôle** : Implémente les user stories du PRD Qalem selon le Ralph Loop
- **Stack** : Next.js 16 + React 19 + TypeScript 5 + Tailwind 4 + Zustand + LangGraph + AI SDK + Supabase
- **Règles** :
  - Toujours lire `.ralph/prd.json` + `.ralph/progress.md` avant chaque itération
  - Une seule story par itération
  - Suivre les patterns dans "Codebase Patterns" de progress.md
  - Typecheck + lint + test + e2e avant de marquer passes=true
  - Commit format : `[S-XXX] Titre exact de la story`
  - Ne jamais modifier hors scope de la story courante

## Quality Gates

```bash
npx tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e
```

## Conventions spécifiques Qalem

- **i18n** : toute nouvelle string UI doit passer par `t()` dans les 3 locales (fr-FR, ar-MA, en-US)
- **TTS** : tout nouveau provider doit implémenter `generateXxxTTS()` dans `tts-providers.ts` + entry dans `constants.ts`
- **Supabase** : RLS activé sur chaque nouvelle table, policies testées
- **Accents FR** : majuscules accentuées obligatoires (É, È, À, Ç, etc.)
- **RTL** : tout nouveau composant UI doit être testé en ar-MA
