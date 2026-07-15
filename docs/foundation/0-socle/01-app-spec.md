# 01 — App-spec · Chantier 0 — SOCLE

> **Fil conducteur** — Amont : `docs/np-cadrage.md` §5-7 (vision, verdict GO option C′, inventaire `refork/`). Aval : les chantiers 1-CRÉER, 2-VIVRE et 3-ANCRER construisent EXCLUSIVEMENT sur la base issue de ce chantier ; le chantier 4-MOTEUR y branche la skill. Rien ne se développe sur l'ancienne base après le palier 0.

## Ce qu'on construit

La **nouvelle base de code Qalem** : upstream OpenMAIC **v0.3.0** (MIT, THU-MAIC) sur branche `refork-v030`, sur laquelle on **copie-adapte** nos personnalisations existantes — jamais de recodage : tout a déjà été développé une fois sur le fork v0.1.0 (146 commits, 72 stories Ralph). L'ancienne base (`main`) devient une **carrière en lecture seule** où l'on pioche à la demande.

**Principe directeur (Amine, 2026-07-10)** : « nous n'allions garder que nos personnalisations […] un copier-adapter est de loin plus simple ». Le chantier 0 est un chantier de **portage par copie-adaptation**, exécuté par Ralph loop — pas un chantier de développement.

## Pour qui, pourquoi maintenant

- **Pour les chantiers 1-3** : la vision (webinaire multi-agents, replay, ancrage 10-90 j) exige les apports v0.3.0 (MAIC Editor, Edit with AI, PBL v2, SDK `@openmaic/*`) — indisponibles sur notre v0.1.0.
- **Pourquoi maintenant** : chaque story développée sur l'ancienne base serait à porter deux fois. Le socle passe en premier, une fois, vite (Ralph : heures, pas nuits).

## Parcours critique (celui du chantier, pas de l'utilisateur final)

1. Branche `refork-v030` initialisée depuis l'archive v0.3.0 vérifiée (`upstream-v030/`, LICENSE MIT lu).
2. Script de portage copie les **264 fichiers OURS_ONLY** (inventaire `refork/inventaire.json`) + applique les **137 diffs < 30 lignes**.
3. Copie-adaptation des fichiers du **socle identitaire** dans la zone BOTH_DIFFER : i18n fr-FR/ar-MA/en-US, RTL (`HtmlDirectionManager`, `rtl-flip`), branding Qalem, providers souverains (LLM, TTS Higgs, ASR), `.env`/config serveur, `ssrf-guard`.
4. `pnpm build && npx tsc --noEmit && pnpm lint && pnpm test` verts ; e2e sur le parcours génération + classroom.
5. Passe RTL ar-MA **humaine** (checkpoint Amine) sur les écrans principaux.
6. Déploiement préprod (Coolify) — la prod `qalem.ai-mpower.com` reste sur `main` jusqu'au critère de bascule (cf. 04-feature-backlog, S0-011).

## Ce que la v1 du chantier EXCLUT (les 3 refus)

1. **Aucune feature nouvelle** — les quick-wins de la vision appartiennent aux chantiers 1-3.
2. **Aucun portage exhaustif de la zone BOTH_DIFFER** — les fichiers hors socle identitaire restent dans la carrière, piochés quand un besoin réel le réclame (pull-based, catalogue = `refork/inventaire.md`).
3. **Aucune bascule prod implicite** — bascule uniquement sur critère décidé par Amine (liste garder/abandonner des features des 72 stories).

## Hypothèses restantes et leur test

| Hypothèse | Test | Critère de réfutation |
|---|---|---|
| Les 264 OURS_ONLY se copient sans conflit d'import sur v0.3.0 | Script de portage + `npx tsc --noEmit` | > 20 % des fichiers copiés cassent le typecheck → la frontière OURS_ONLY/BOTH_DIFFER de l'inventaire est fausse, re-mesurer |
| Le socle identitaire tient dans ~40 fichiers BOTH_DIFFER | S0-004 à S0-007 (backlog) | Découverte de dépendances i18n/RTL éparpillées hors inventaire → élargir le palier, consigner en ADR |
| Higgs TTS reste joignable et compatible (`.7:7861`, API OpenAI) | Story S0-006 : appel de vérification réel | HTTP ≠ 200 ou format incompatible → provider à re-vérifier avec Amine (AR non tranché de toute façon) |

## Traçabilité verdict

Verdict **GO — option C′** (np-cadrage §7, 2026-07-10). Niveau **L99**. Exécutant : **Ralph loop** (`.ralph/prd.json` dérivé du 04-feature-backlog de ce dossier, cf. Phase 4).
