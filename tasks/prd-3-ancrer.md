[PRD]
# PRD : Chantier 3 — ANCRER (post-formation 10-90 jours)

## Overview

La boucle d'ancrage : graines poussées 10-90 jours (stock généré à la fin de session, opt-in strict, borne J+90), rappels quiz FSRS, évaluations à chaud/à froid, reporting agrégé, émission xAPI optionnelle. Source produit : `docs/foundation/3-ancrer/`. Démarrage : S0-008 (données de test) ; matière réelle dès S2-004.

## Goals

- Le savoir survit à la session : graines signées par les personnalités de LA session vécue.
- La valeur se mesure : à chaud vs à froid, rétention quiz dans le temps.
- L'org voit l'ancrage dans SON système si elle en a un (xAPI).

## Quality Gates

These commands must pass for every user story (branche `refork-v030`) :
- `npx tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e` (stories [e2e])

Stories UI : vérification ar-MA (RTL).

## User Stories

### S3-001 : Tables du chantier
**Description:** En tant que développeur, je veux le schéma d'ancrage avec ses invariantes en SQL afin que les garanties produit soient des contraintes, pas des promesses.

**Acceptance Criteria:**
- [ ] 5 migrations conformes au data-dictionary : `seeds`, `anchor_plans` (unique session, borne J+90 en trigger), `anchor_deliveries`, `evaluations` (unique session/user/phase), `xapi_outbox`
- [ ] RLS testées (user seul ; agrégats org en lecture)

### S3-002 : Push PWA re-vérifié appareils réels
**Description:** En tant qu'apprenant mobile, je veux recevoir les pushes sur mon téléphone afin que l'ancrage me parvienne réellement.

**Acceptance Criteria:**
- [ ] Push reçu sur iOS réel (PWA installée, Safari ≥ 16.4) ET Android réel
- [ ] Tap → ouverture PWA sur la carte cible
- [ ] Résultat de délivrance consigné (source de vérité du choix de canal — si iOS échoue : réouvrir ADR-303, question à Amine)

### S3-003 : Évaluation à chaud [UI]
**Description:** En tant qu'apprenant, je veux donner mon ressenti en 30 secondes en fin de session afin que la mesure commence sans friction.

**Acceptance Criteria:**
- [ ] Hook fin de session (chantier 2) : 2 questions, skippable
- [ ] Écrit `evaluations(phase='hot')` ; unicité par phase prouvée par test
- [ ] 3 locales, RTL vérifié

### S3-004 : Générateur de graines (stock)
**Description:** En tant qu'apprenant, je veux des graines dérivées de MA session, signées par MON équipe, afin que chaque rappel ravive du vécu.

**Acceptance Criteria:**
- [ ] Une session vécue → ≥ 12 graines typées (anecdote 4+, highlight 4+, joke 2+, quiz_reminder 2+) via le prompt P3-B versionné
- [ ] Chaque graine cite une `scene_ref` réelle et un persona du casting de la session
- [ ] UN SEUL appel de génération par session (grep : aucun appel LLM dans le chemin d'envoi) ; coût consigné

### S3-005 : Plan d'ancrage + planification BullMQ
**Description:** En tant qu'apprenant, je veux choisir de continuer 90 jours avec mon équipe afin d'ancrer sans être harcelé.

**Acceptance Criteria:**
- [ ] Opt-in explicite → deliveries planifiées à espacement croissant ≤ J+90
- [ ] Pause en un tap depuis chaque push ; arrêt = suppression des deliveries futures
- [ ] Jobs BullMQ rejouables ; flag `anchoring`

### S3-006 : Rappels quiz espacés (FSRS) [e2e]
**Description:** En tant qu'apprenant, je veux des rappels de quiz au bon moment afin de consolider ce qui s'efface.

**Acceptance Criteria:**
- [ ] Items de quiz de la session entrés dans la file FSRS (`lib/spaced-repetition/` étendu, pas réécrit)
- [ ] Cycle complet testé : rappel push → quiz ouvert → résultat re-nourrit FSRS
- [ ] Limite Bloom constatée → consignée au parking lot, pas corrigée en passant

### S3-007 : Évaluation à froid J+30/J+60
**Description:** En tant que créateur, je veux mesurer ce qui reste à froid afin de prouver la valeur au-delà du ressenti.

**Acceptance Criteria:**
- [ ] Deliveries `cold_eval` planifiées ; réponses en `evaluations(phase='cold_30'/'cold_60')`
- [ ] Unicité par phase prouvée (insertion doublon rejetée)

### S3-008 : Ton des graines + fréquences [CHECKPOINT AMINE]
**Description:** En tant que propriétaire du produit, je veux valider le ton et le rythme sur échantillon réel afin que la voix soit la mienne.

**Acceptance Criteria:**
- [ ] 20 graines réelles + plan de fréquence proposé (gabarit 06-brand-brief)
- [ ] Validation explicite consignée AVANT activation du flag `anchoring` en préprod

### S3-009 : Reporting ancrage [UI] [e2e]
**Description:** En tant qu'organisation, je veux voir la participation et la rétention agrégées afin de piloter mes formations.

**Acceptance Criteria:**
- [ ] Agrégats : participation, à chaud vs à froid, rétention quiz dans le temps
- [ ] Lecture seule org ; AUCUN drill-down individuel (test d'accès le prouvant)

### S3-010 : Émission xAPI (outbox)
**Description:** En tant qu'organisation équipée d'un LRS, je veux recevoir les statements d'ancrage afin de consolider dans mon système.

**Acceptance Criteria:**
- [ ] Statements conformes vérifiés contre un LRS de test (protocole P3-C, retry outbox prouvé LRS coupé)
- [ ] Acteur pseudonymisé (aucun e-mail/nom en clair — test)
- [ ] Flag `xapi_emission` ; credentials LRS par org chiffrés (jamais dans le coffre personnel)

## Functional Requirements

- FR-1 : Aucun envoi sans opt-in ; borne J+90 infranchissable (contrainte).
- FR-2 : La graine parle la langue de la session (pas celle de l'UI).
- FR-3 : Aucun tracking tiers ; engagement mesuré par `sent_at`/`opened_at` seulement.
- FR-4 : Une graine ne promeut jamais autre chose que la formation vécue et le service (≠ prospection).

## Non-Goals

- Canaux e-mail/WhatsApp (placeholders — ne pas les câbler) ; Kirkpatrick L4 ; regénération de graines ; digest hebdomadaire ; LRS intégré.

## Success Metrics

- 10/10 stories ; un plan réel déroulé en accéléré : graines reçues sur appareil réel, éval à froid mesurée, reporting agrégé cohérent.

## Open Questions

- Ton/fréquences (S3-008, Amine) ; délivrance iOS réelle (S3-002 — peut réouvrir le choix de canal).
[/PRD]
