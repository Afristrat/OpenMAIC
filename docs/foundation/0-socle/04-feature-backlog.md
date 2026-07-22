# 04 — Feature backlog · Chantier 0 — SOCLE

> **Fil conducteur** — Amont : 01-app-spec (parcours critique du portage). Aval : ces stories deviennent le `.ralph/prd.json` v2 (Phase 4) et DÉBLOQUENT les backlogs des chantiers 1-3 (aucune de leurs stories ne démarre avant S0-008 verte). Filtre Ponytail appliqué : chaque story est indispensable au parcours critique du portage, sinon parking lot.

## v1 gelée (stories Ralph, critères binaires)

| ID | Story | Critère d'acceptation (binaire) |
|---|---|---|
| S0-001 | Initialiser `refork-v030` depuis l'archive v0.3.0 vérifiée | Branche créée, contenu = `upstream-v030/` (LICENSE MIT présente), `CI=true pnpm install` + `pnpm build` verts sur base vierge |
| S0-002 | Script de portage : copier les 264 OURS_ONLY depuis la carrière | Script Python rejouable (`refork/port_ours_only.py`), 264 fichiers présents sur la branche, liste d'écart vide vs `inventaire.json` |
| S0-003 | Porter les migrations Supabase + config data telles quelles | `supabase/migrations/` identique à la carrière, RLS présent sur chaque table (vérifié par grep policies) |
| S0-004 | Appliquer les 137 diffs < 30 lignes (semi-automatique) | Patchs appliqués ou rejet consigné fichier par fichier dans `refork/port-log.md` ; `npx tsc --noEmit` vert |
| S0-005 | Copie-adaptation du socle i18n + RTL | 3 locales complètes chargées, `HtmlDirectionManager` + `rtl-flip` actifs, aucune string zh-CN dans l'UI, typecheck vert |
| S0-006 | Copie-adaptation branding + providers souverains | Titre/manifest/logos Qalem en place ; config providers portée ; appel de vérification réel Higgs TTS = HTTP 200 (sinon story bloquée, question à Amine) |
| S0-007 | Copie-adaptation config serveur (`.env.example`, `server-providers.yml`, `ssrf-guard`) | Diff de la carrière rejoué, `.env.example` couvre toutes les variables réellement lues (grep `process.env`) |
| S0-008 | Quality gate complet + e2e sur génération & classroom | `npx tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e` verts — signal de déblocage des chantiers 1-3 |
| S0-009 | Table `feature_flags` + helper de lecture | Migration conforme au 02-data-dictionary, RLS testée, helper TS typé consommé par un test |
| S0-010 | Figer la carrière + CI | `main` taguée `legacy-v010-final`, CI GitHub Actions verte sur `refork-v030`, remote poussé (permanence prouvée, règle n°4) |
| S0-011 | **[CHECKPOINT AMINE]** Liste garder/abandonner des features des 72 stories | Checklist générée depuis l'inventaire et les stories Ralph v1, présentée à Amine ; sa tranche consignée en ADR — conditionne la bascule prod |
| S0-012 | **[CHECKPOINT AMINE]** Passe RTL ar-MA visuelle | Parcours guidé préparé (écrans + points de contrôle) ; verdict d'Amine consigné ; défauts → stories de pioche |
| S0-013 | Déploiement préprod Coolify de `refork-v030` | URL préprod répond 200, génération d'une formation de bout en bout réussie en FR et en AR |
| S0-014 | Purge de provenance AGPL — les 35 fichiers du majorant (ADR-002) | Chaque fichier de `refork/audit-provenance.json` : équivalent v0.3.0 mappé, réécrit depuis la base MIT selon une méthode clean-room, ou supprimé comme obsolète avec remplaçant fonctionnel ; liste résiduelle vide ; contrôle CI et `THIRD-PARTY-NOTICES` créés. Preuve technique, sans conclusion juridique automatique. |

## Parking lot (YAGNI institutionnalisé — condition de sortie obligatoire)

| Item | Condition de sortie |
|---|---|
| Portage des ~120 fichiers BOTH_DIFFER hors socle (30-1672 lignes) | Un besoin réel d'un chantier 1-3 réclame le fichier — pioche à l'unité, story dédiée |
| Correction dette `lib/skills/types.ts` (`Skill.name: string` vs Record i18n) | Premier travail réel du chantier 4 sur les skill packs |
| `flag_overrides` (flags par org/user) | Premier pilote nécessitant une activation partielle |
| Bascule prod `qalem.ai-mpower.com` → nouvelle base | S0-011 tranchée + S0-012 validée + parité e2e sur le périmètre gardé |
| Rapatriement sélectif tests/e2e carrière (1 288 lignes divergentes) | Un test couvre une feature repiochée — porté avec elle |
