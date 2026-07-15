[PRD]
# PRD : Chantier 4 — MOTEUR (processus de cadrage de la skill — PAS son contenu)

## Overview

⚠️ Le moteur (skill formation-design-pro) N'A JAMAIS ÉTÉ CADRÉ (rappel Amine 2026-07-10). Ce PRD séquence le PROCESSUS qui mènera à ce cadrage : inventaire prouvé du corpus, lots de vecteurs proposés, exécution du seul validé, double publication (plateforme + skill autonome). Chaque vecteur = ⏸️ validation d'Amine. Démarrage : à son signal explicite uniquement. Source produit : `docs/foundation/4-moteur/`.

## Goals

- Rendre le cadrage exécutable sans rien préjuger de son résultat.
- Double cible prouvée : le même savoir agit dans la plateforme ET dans la skill seule.
- Zéro duplication de savoir entre chantiers (une seule source de voix).

## Quality Gates

Stories de processus (S4-001 à S4-003) : le gate est documentaire — livrable conforme à son prompt (P4-A/P4-B), zéro modification des répertoires sources (lecture seule prouvée).
Stories techniques (S4-004+) : `npx tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e` sur `refork-v030`.

## User Stories

### S4-001 : Inventaire prouvé du corpus [lecture seule]
**Description:** En tant que propriétaire du produit, je veux l'état factuel complet de mon corpus afin de trancher sur des faits, pas des impressions.

**Acceptance Criteria:**
- [ ] Les 3 sources lues intégralement (OneDrive maître, `~/.claude/skills/formation-design-pro/`, `DIAGNOSTIC-formation-design-pro.md`)
- [ ] Écarts entre copies mesurés par script (fichiers, diffs) — livrable `inventaire-corpus.md` conforme à P4-A
- [ ] Colonne « source tierce ? » remplie par fichier (nourrit le legal)
- [ ] AUCUNE proposition dans le livrable ; AUCUNE écriture dans les sources

### S4-002 : Vecteurs lot 1 — architecture et réconciliation [⏸️ AMINE]
**Description:** En tant que propriétaire du produit, je veux des options chiffrées sur OÙ vit le corpus et COMMENT il se publie en double cible afin de décider en connaissance de cause.

**Acceptance Criteria:**
- [ ] ≤ 7 vecteurs au format P4-B (constat sourcé, options + coûts, recommandation, impact double cible, ce que ça ne décide pas)
- [ ] Inclut obligatoirement : localisation du corpus canonique (avec l'argument AGPL/propriété du 07-legal), réconciliation des copies, mécanisme de double publication
- [ ] Chaque tranche d'Amine consignée en ADR-4xx avec verbatim daté ; rien d'exécuté avant

### S4-003 : Vecteurs lot 2 — structure du savoir [⏸️ AMINE]
**Description:** En tant que propriétaire du produit, je veux des vecteurs sur la structure du corpus (les pistes du diagnostic re-proposées sans être considérées acquises) afin de refondre de fond en comble.

**Acceptance Criteria:**
- [ ] Vecteurs couvrant au minimum : SKILL.md (1238 lignes → cible), doublons `maj/`, pedagogical-frameworks vs -updated, module preuve d'impact, Mode 0 — chacun redevenu simple option
- [ ] Validations consignées ; le refusé est consigné aussi (avec le motif)

### S4-004 : Exécution des vecteurs validés
**Description:** En tant que propriétaire du produit, je veux chaque vecteur validé exécuté isolément afin de pouvoir auditer et annuler unitairement.

**Acceptance Criteria:**
- [ ] Un commit par vecteur, référence du vecteur en message
- [ ] Zéro exécution hors validation (l'écart entre ADR validées et commits = vide)

### S4-005 : Publication cible plateforme
**Description:** En tant que créateur sur Qalem, je veux que le moteur refondu agisse dans la génération afin que la plateforme enseigne selon le corpus validé.

**Acceptance Criteria:**
- [ ] Manifests/overrides alimentés par le savoir validé (en-têtes de traçabilité : source, vecteur, date)
- [ ] Test S1-001 étendu : un override du moteur refondu change observablement une génération

### S4-006 : Publication cible skill autonome
**Description:** En tant qu'Amine, je veux utiliser la skill seule hors plateforme afin de garder mon outil nomade.

**Acceptance Criteria:**
- [ ] Protocole P4-C passé : invocation réelle hors repo Qalem, livrable conforme à la signature andragogique, zéro référence cassée
- [ ] Échec = retour au vecteur de double publication, pas de rustine

### S4-007 : Cohérence des consommateurs aval
**Description:** En tant que mainteneur, je veux une seule source de voix afin qu'aucun chantier ne duplique le savoir.

**Acceptance Criteria:**
- [ ] Registres des personnalités (2-VIVRE) et anatomie des graines (3-ANCRER) référencent le moteur refondu
- [ ] Grep de duplication : zéro copie de contenu andragogique hors moteur

## Functional Requirements

- FR-1 : Sources maîtres en lecture seule jusqu'à la tranche du vecteur d'architecture.
- FR-2 : Tout savoir exposé à l'UI existe dans les 3 locales ou déclare sa locale unique.
- FR-3 : Aucun vecteur business dans les lots.
- FR-4 : La dette `lib/skills/types.ts:55` ne se corrige que par vecteur technique validé.

## Non-Goals

- Décider du contenu andragogique à la place d'Amine ; démarrer sans son signal ; distribuer la skill à l'externe (décision business).

## Success Metrics

- 7/7 stories ; le même savoir prouvé actif dans la plateforme et dans la skill seule ; 100 % des ADR-4xx portent un verbatim de validation daté.

## Open Questions

- Signal de démarrage (« le moment venu ») ; toutes les tranches de vecteurs — Amine.
[/PRD]
