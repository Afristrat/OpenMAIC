[PRD]
# PRD : Chantier 0 — SOCLE (re-fork v0.3.0 par copie-adaptation)

## Overview

Construire la nouvelle base Qalem : upstream OpenMAIC v0.3.0 (MIT) sur branche `refork-v030`, personnalisations existantes copiées-adaptées depuis la carrière (`main`, figée en lecture seule). Rien n'est recodé : tout existe dans `upstream-v030/` (archive vérifiée, 98 Mo) ou dans `main`. Catalogue de portage : `refork/inventaire.json` (264 OURS_ONLY, 137 diffs < 30 lignes, socle identitaire dans BOTH_DIFFER). Source produit : `docs/foundation/0-socle/`.

## Goals

- Base `refork-v030` verte (typecheck, lint, tests, e2e) démontrable en FR et en AR.
- `main` = carrière lecture seule taguée ; bascule prod uniquement sur critère décidé.
- Débloquer les chantiers 1-3 (gate S0-008).

## Quality Gates

These commands must pass for every user story (depuis `OpenMAIC/`, branche `refork-v030`) :
- `npx tsc --noEmit` — zéro erreur TypeScript
- `pnpm lint` — zéro erreur/warning
- `pnpm test` — tests unitaires vitest
- `pnpm test:e2e` — Playwright (stories marquées [e2e])

Pour les stories UI : vérification visuelle en ar-MA (RTL) en plus des gates.

## User Stories

### S0-001 : Initialiser la branche refork-v030
**Description:** En tant que mainteneur, je veux une branche `refork-v030` au contenu identique à l'archive v0.3.0 vérifiée afin d'avoir une fondation MIT propre et prouvée.

**Acceptance Criteria:**
- [ ] Branche `refork-v030` créée ; contenu = `C:\projets\Qalem\upstream-v030\` (LICENSE MIT présente, diff vide contre l'archive)
- [ ] `CI=true pnpm install` réussit (leçon errors-log : jamais de pnpm install sans CI=true en session agent)
- [ ] `pnpm build` vert sur base vierge, avant tout portage
- [ ] Commit initial `[S0-001]` poussé sur origin (permanence prouvée)

### S0-002 : Script de portage des 264 fichiers OURS_ONLY
**Description:** En tant que mainteneur, je veux un script rejouable qui copie nos fichiers exclusifs depuis la carrière afin que le portage soit mécanique et vérifiable.

**Acceptance Criteria:**
- [ ] `refork/port_ours_only.py` copie les fichiers listés OURS_ONLY dans `refork/inventaire.json` depuis `git show main:<path>`
- [ ] Les 264 fichiers présents sur `refork-v030` ; liste d'écart script vs inventaire = vide
- [ ] Script rejouable (idempotent) ; log d'exécution écrit dans `refork/port-log.md`

### S0-003 : Porter les migrations Supabase telles quelles
**Description:** En tant que mainteneur, je veux le schéma des 72 stories intact sur la nouvelle base afin que les données existantes restent compatibles.

**Acceptance Criteria:**
- [ ] `supabase/migrations/` identique à la carrière (diff vide)
- [ ] Chaque table porte ses policies RLS (vérifié par grep `create policy` : aucun écart avec la carrière)

### S0-004 : Appliquer les 137 diffs < 30 lignes
**Description:** En tant que mainteneur, je veux les petites divergences rejouées automatiquement afin de réserver l'humain/l'agent aux vrais arbitrages.

**Acceptance Criteria:**
- [ ] Patchs appliqués (ou rejet motivé) fichier par fichier, consignés dans `refork/port-log.md`
- [ ] Aucun fichier de la liste sans mention appliqué/rejeté

### S0-005 : Copie-adaptation du socle i18n + RTL [UI]
**Description:** En tant qu'utilisateur, je veux l'interface complète en fr-FR/ar-MA/en-US avec RTL natif afin que la nouvelle base soit Qalem et pas OpenMAIC vanilla.

**Acceptance Criteria:**
- [ ] Les 3 locales chargées, sélecteur de langue fonctionnel ; aucune string zh-CN dans l'UI (zh-CN reste fallback code)
- [ ] `HtmlDirectionManager` actif ; classe `rtl-flip` appliquée aux icônes directionnelles
- [ ] Écrans principaux (accueil, génération, classroom, paramètres) rendus en ar-MA sans débordement bloquant

### S0-006 : Copie-adaptation branding + providers souverains
**Description:** En tant qu'utilisateur, je veux retrouver l'identité Qalem et nos fournisseurs (LLM, TTS Higgs, ASR) afin que la plateforme reste souveraine.

**Acceptance Criteria:**
- [ ] Titre, manifest PWA, logos et palette Qalem en place (source `app/globals.css` de la carrière)
- [ ] Config providers portée (`lib/ai/providers.ts`, `lib/audio/` — copie-adaptation aux structures v0.3.0)
- [ ] Appel de vérification réel Higgs TTS = HTTP 200 (si studio `.7` indisponible : story bloquée avec question, pas de contournement)

### S0-007 : Copie-adaptation config serveur et garde-fous
**Description:** En tant que mainteneur, je veux `.env.example`, `server-providers.yml` et `ssrf-guard` portés afin qu'aucune variable réelle ne manque au déploiement.

**Acceptance Criteria:**
- [ ] `lib/server/ssrf-guard.ts` porté et couvert par ses tests
- [ ] `.env.example` couvre toutes les variables réellement lues (grep `process.env` sans orphelin)
- [ ] Grep secrets en dur = zéro occurrence

### S0-008 : Quality gate complet + e2e génération & classroom [e2e]
**Description:** En tant que mainteneur, je veux la preuve que la base portée fonctionne de bout en bout afin de débloquer les chantiers 1-3.

**Acceptance Criteria:**
- [ ] Les 4 gates verts d'affilée sur `refork-v030`
- [ ] e2e : génération d'une formation puis session classroom, en fr-FR ET ar-MA
- [ ] `.ralph/progress.md` consigne le déblocage des chantiers 1-3

### S0-009 : Table feature_flags + helper
**Description:** En tant que développeur des chantiers 1-3, je veux des feature flags en base afin de livrer en continu sans branches longues.

**Acceptance Criteria:**
- [ ] Migration conforme à `docs/foundation/0-socle/02-data-dictionary.md` (contraintes check, RLS lecture authentifiée/écriture service)
- [ ] Helper TS typé `lib/flags/` consommé par au moins un test

### S0-010 : Figer la carrière + CI
**Description:** En tant que mainteneur, je veux `main` taguée et la CI verte sur la nouvelle branche afin que la carrière soit immuable et la base surveillée.

**Acceptance Criteria:**
- [ ] Tag `legacy-v010-final` posé sur `main` et poussé
- [ ] CI GitHub Actions verte sur `refork-v030`
- [ ] `docs/foundation/0-socle/03-claude-directives.md` : règle carrière lecture seule rappelée dans `.ralph/AGENTS.md`

### S0-011 : Checklist garder/abandonner [CHECKPOINT AMINE]
**Description:** En tant que propriétaire du produit, je veux la liste exhaustive des capacités de `main` absentes de la nouvelle base afin de trancher ce qui conditionne la bascule prod.

**Acceptance Criteria:**
- [ ] `docs/foundation/0-socle/checklist-bascule.md` généré selon le prompt P0-B (preuves fichier:ligne, colonne Décision VIDE)
- [ ] Les 72 stories v1 toutes couvertes (comptage)
- [ ] Story close UNIQUEMENT à la tranche d'Amine consignée (l'agent ne décide pas)

### S0-012 : Parcours guidé passe RTL [CHECKPOINT AMINE] [UI]
**Description:** En tant que propriétaire du produit, je veux un parcours de contrôle RTL écran par écran afin de valider visuellement l'arabe avant toute bascule.

**Acceptance Criteria:**
- [ ] `checklist-rtl.md` livré (écrans, points de contrôle, cases + champ défaut)
- [ ] Verdict d'Amine consigné ; chaque défaut devient une story de pioche chiffrée

### S0-013 : Déploiement préprod Coolify [e2e]
**Description:** En tant que propriétaire du produit, je veux la nouvelle base en préprod afin de la voir vivre sans toucher à la prod.

**Acceptance Criteria:**
- [ ] URL préprod HTTP 200 (la prod qalem.ai-mpower.com reste sur `main`)
- [ ] Génération d'une formation de bout en bout réussie en FR et en AR sur la préprod

## Functional Requirements

- FR-1 : Tout portage cherche d'abord l'équivalent carrière (`git show main:<path>`) — écrire du neuf est l'exception motivée en commit.
- FR-2 : Aucune story ne modifie `main` (hors tag S0-010).
- FR-3 : README/CONTRIBUTING/CHANGELOG upstream intouchés (soft fork).
- FR-4 : Toute string UI passe par `t()` dans les 3 locales.

## Non-Goals

- Aucune feature nouvelle (chantiers 1-3) ; aucun portage BOTH_DIFFER hors socle identitaire (pioche à la demande) ; aucune bascule prod (S0-011/S0-012 + décision explicite requises).

## Success Metrics

- 13/13 stories passes=true ; base démontrable FR/AR en préprod ; carrière figée ; zéro dette (gates verts).

## Open Questions

- Tranche S0-011 (garder/abandonner) et verdict S0-012 (RTL) — Amine.
[/PRD]
