[PRD]
# PRD : Chantier 1 — CRÉER (trois portes d'entrée + sorties)

## Overview

Ouvrir les trois portes d'entrée vers une formation (générer / catalogue / importer selon canevas co-validé) et les sorties (capsules Hyperframes, audio gaté, exports PPTX + SCORM deux couches), sur la base issue du chantier 0 (MAIC Editor et Edit with AI natifs v0.3.0 — consommés, jamais réimplémentés). Source produit : `docs/foundation/1-creer/`. Démarrage : S0-008 verte.

## Goals

- Toute formation, quelle que soit sa porte, aboutit à un `course` `ready` lançable en classe (pivot du chantier 2).
- Le moteur andragogique cesse d'être une vitrine (`getPromptOverride()` réellement appelé).
- Exports crédibles vers les LMS clients (architecture deux couches).

## Quality Gates

These commands must pass for every user story (branche `refork-v030`) :
- `npx tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e` (stories [e2e])

Stories UI : vérification ar-MA (RTL). Toute feature en cours : derrière son feature flag.

## User Stories

### S1-001 : Câbler le moteur dans la génération
**Description:** En tant que créateur, je veux que le skill pack actif modifie réellement la génération afin que la promesse « skills appliqués » cesse d'être une vitrine.

**Acceptance Criteria:**
- [ ] `getPromptOverride()` appelé dans le pipeline outline (`lib/generation/outline-generator.ts`) ET scène (`scene-generator.ts`)
- [ ] Test unitaire : un skill pack actif change observablement le prompt assemblé des deux étages
- [ ] Flag `skill_engine` ; comportement inchangé flag éteint

### S1-002 : Canevas d'import co-validé [CHECKPOINT AMINE+CLAUDE]
**Description:** En tant que propriétaire du produit, je veux un canevas de dépôt validé par nous deux afin que la porte 3 garantisse la qualité de sortie.

**Acceptance Criteria:**
- [ ] Proposition générée selon P1-A (règles numérotées testables par programme, exemple complet FR)
- [ ] `docs/foundation/1-creer/canevas-import-v1.md` porte la double validation explicite (Amine + Claude, datée)
- [ ] AUCUN code d'import commité avant cette validation

### S1-003 : Tables courses + course_imports + validation du canevas
**Description:** En tant qu'utilisateur, je veux déposer mon contenu et recevoir un verdict clair (conforme / écarts listés) afin de savoir exactement quoi corriger.

**Acceptance Criteria:**
- [ ] Migrations conformes au data-dictionary (checks `source_kind`, lien import, RLS owner/org)
- [ ] Dépôt conforme → `validation_status='conform'` ; non conforme → `rejected` + `validation_report` citant les règles (tests des deux chemins)
- [ ] Messages de rejet au ton du brand-brief (diagnostic, jamais sanction)

### S1-004 : Catalogue interne (porte 2) [UI] [e2e]
**Description:** En tant qu'apprenant, je veux parcourir les formations prêtes et rejoindre une classe afin de consommer sans créer.

**Acceptance Criteria:**
- [ ] Page catalogue : `courses` où `status='ready'` et `catalog_visible=true`
- [ ] « Rejoindre la classe » ouvre le classroom sur le `course_id` (e2e)
- [ ] Flag `course_catalog` ; rendu ar-MA vérifié

### S1-005 : Import → outline (porte 3) [e2e]
**Description:** En tant que créateur, je veux que mon contenu conforme devienne une outline éditable afin d'initier ma formation depuis mon propre matériau.

**Acceptance Criteria:**
- [ ] Contenu conforme → outline chargée dans l'Editor natif v0.3.0
- [ ] e2e complet : dépôt → validation → outline → `status='ready'`
- [ ] Parsing PDF via le provider existant (MinerU) — aucun nouveau parseur

### S1-006 : Capsule vidéo Hyperframes
**Description:** En tant que créateur, je veux une capsule vidéo de marque générée depuis une scène afin d'enrichir la formation sans service vidéo externe.

**Acceptance Criteria:**
- [ ] Brief JSON conforme au contrat P1-B déposé ; mp4 récupéré et relu dans l'app
- [ ] Interface par fichiers uniquement (aucun import de code du repo mishkat)
- [ ] Job BullMQ ; flag `video_capsules` ; sous-titres dans la langue du course (RTL si AR)

### S1-007 : Export SCORM couche 1 — package autonome
**Description:** En tant que client institutionnel, je veux importer un package Qalem dans mon LMS afin de consommer le contenu chez moi.

**Acceptance Criteria:**
- [ ] `export_jobs` format `scorm12` → zip avec `imsmanifest.xml` valide
- [ ] Import réussi dans un Moodle docker local : cours visible, completion trackée (preuve consignée)
- [ ] Runtime embarqué : adaptateurs natifs appelant l'API du LMS ; aucune notice `scorm-again`, car aucun code de cette dépendance n'est distribué (ADR-106 supplante ADR-102)

### S1-008 : Export couche 2 — adaptateurs interchangeables
**Description:** En tant que client, je veux le même contenu en SCORM 1.2, SCORM 2004 ou cmi5 afin de coller à MON LMS sans double production.

**Acceptance Criteria:**
- [x] Un générateur unique ; 3 formats produits en changeant le seul adaptateur (test : 3 packages, 1 générateur, diff limité à la couche tracking)
- [x] Import Moodle vérifié pour scorm2004 ; cmi5 vérifié contre son player de référence
- [ ] Statut produit (option/cœur) consigné en ADR-105 dès la tranche d'Amine

### S1-009 : Gate audio — tachkil AR + noise-floor
**Description:** En tant qu'apprenant arabophone, je veux un audio vocalisé et propre afin que la qualité s'entende (leçon VoxCPM).

**Acceptance Criteria:**
- [ ] Pipeline TTS AR applique le tachkil avant synthèse (fixture avec diff vocalisé)
- [ ] Toute piste au plancher de bruit < -50 dB rejetée avec erreur explicite (test sur fixture bruitée)
- [ ] Gate branché sur TOUTES les sorties TTS (live, capsules, exports)

### S1-010 : Export PPTX re-vérifié
**Description:** En tant que créateur, je veux exporter mes slides en PPTX afin de réutiliser mon support hors plateforme.

**Acceptance Criteria:**
- [ ] Export d'un course généré s'ouvre sans réparation dans PowerPoint
- [ ] Packages workspace `mathml2omml`/`pptxgenjs` buildés au postinstall (preuve)

## Functional Requirements

- FR-1 : Le pivot `courses` masque la provenance (colonne `source_kind`, jamais trois chemins de code).
- FR-2 : Toute sortie TTS passe le gate S1-009.
- FR-3 : Les exports n'embarquent JAMAIS de données personnelles d'apprenants Qalem.
- FR-4 : MAIC Editor / Edit with AI consommés natifs, jamais réimplémentés.

## Non-Goals

- Marketplace/monétisation ; import format libre ; génération vidéo IA externe ; xAPI temps réel (chantier 3) ; voix clonées.

## Success Metrics

- 10/10 stories ; les 3 portes praticables e2e ; un package SCORM importé avec succès dans un LMS réel.

## Open Questions

- Canevas v1 (co-validation S1-002) ; statut SCORM option/cœur (ADR-105, Amine).
[/PRD]
