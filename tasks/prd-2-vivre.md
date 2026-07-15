[PRD]
# PRD : Chantier 2 — VIVRE (classe live, casting, replay, watermark)

## Overview

Le cœur de la vision : classe live multi-agents personnalisée (casting selon profil/culture, variation garantie), enregistrement consenti, replay en streaming (jamais de fichier téléchargeable), identifiant indélébile par destinataire sur les supports transmis. Quick-win désigné : S2-001→S2-003. Source produit : `docs/foundation/2-vivre/`. Démarrage : S0-008 verte.

## Goals

- Chaque lancement de formation = une équipe inédite adaptée à l'utilisateur.
- Toute session peut être revécue fidèlement (audio inclus) sur plateforme et PWA.
- Tout support transmis est traçable (watermark sonore + visuel, pseudonymisé).

## Quality Gates

These commands must pass for every user story (branche `refork-v030`) :
- `npx tsc --noEmit`
- `pnpm lint`
- `pnpm test`
- `pnpm test:e2e` (stories [e2e])

Stories UI : vérification ar-MA (RTL). Stories touchant le live : e2e prouvant que la classe parle encore. S2-004+ : GATE DPIA instruit AVANT.

## User Stories

### S2-001 : Profil utilisateur enrichi [UI]
**Description:** En tant qu'apprenant, je veux renseigner ma culture, ma langue et mes préférences afin que la classe s'adapte à moi.

**Acceptance Criteria:**
- [ ] Migration `user_profiles` conforme au data-dictionary (culture, ui_language check 3 locales, preferences jsonb, RLS user seul)
- [ ] Écran de profil dans les 3 locales, RTL vérifié
- [ ] Flag `rich_profile`

### S2-002 : Casting personnalisé — QUICK-WIN [UI] [e2e]
**Description:** En tant qu'apprenant, je veux une équipe pédagogique aux personnalités et prénoms de ma culture, mixte, afin de vivre une classe qui me ressemble.

**Acceptance Criteria:**
- [ ] Le lineup dérive du profil (culture → référentiel de prénoms) ET du contenu (adaptation de `app/api/generate/agent-profiles/route.ts` porté : 1 professeur minimum)
- [ ] Mixité présente dans chaque lineup généré (test statistique sur 20 tirages)
- [ ] Écran « votre équipe du jour » (révélation, pas formulaire) ; e2e en fr ET ar
- [ ] Les référentiels sont des fichiers de données versionnés — contenu proposé, PAS activé avant S2-011

### S2-003 : Variation garantie
**Description:** En tant qu'apprenant, je veux une équipe différente à chaque session d'une même formation afin que l'expérience reste inédite.

**Acceptance Criteria:**
- [ ] Table `castings` avec `unique (user_id, course_id, lineup_hash)` active
- [ ] Test : 2 lancements consécutifs du même couple → lineups différents ; collision d'unicité → re-tirage automatique (testé par insertion forcée)

### S2-004 : Enregistrement du live — flux d'événements complet [GATE DPIA]
**Description:** En tant qu'apprenant, je veux enregistrer ma session (avec mes interventions) afin de pouvoir la revivre.

**Acceptance Criteria:**
- [ ] DPIA instruite et consignée AVANT tout commit de la story (délégation rgpd-bounty-hunter)
- [ ] Consentement UI explicite (jamais pré-coché) → `live_sessions.recorded`
- [ ] `session_events` capture actor agent/user/system : speech, actions scéniques, messages et audio utilisateur ; append-only (grep : aucun UPDATE applicatif)
- [ ] Pistes TTS persistées (`audio_path`) ; coût stockage mesuré et consigné (Mo/session — nourrit ADR-203)

### S2-005 : Replay « comme un vrai webinaire » [e2e]
**Description:** En tant qu'apprenant, je veux revivre ma session à l'identique (voix incluses) afin de réviser comme si j'y étais.

**Acceptance Criteria:**
- [ ] Une session enregistrée se rejoue intégralement : scènes, actions, voix des agents, interventions utilisateur (extension de `lib/playback/` porté — copie-adaptation, pas réécriture)
- [ ] Fonctionne sur plateforme ET PWA
- [ ] Test affirmatif : AUCUNE route ne sert un artefact de session en `Content-Disposition: attachment`

### S2-006 : Bibliothèque de replays [UI] [e2e]
**Description:** En tant qu'apprenant, je veux retrouver, reprendre et supprimer mes sessions afin de gérer mon historique.

**Acceptance Criteria:**
- [ ] Liste « mes sessions » ; reprise à l'horodatage
- [ ] Suppression par l'utilisateur = effacement effectif des `session_events` ET pistes audio (vérifié en base, pas un soft-delete d'affichage)

### S2-007 : Andragogie dans le live
**Description:** En tant qu'apprenant, je veux des interventions d'agents gouvernées par le moteur andragogique afin que la classe enseigne, pas seulement anime.

**Acceptance Criteria:**
- [ ] Les prompts du director/agents consomment les overrides du moteur (interface S1-001)
- [ ] Test : un override actif change observablement le comportement d'une personnalité en live

### S2-008 : Watermark sonore (audiowmark, job async)
**Description:** En tant que créateur, je veux chaque support audio transmis marqué au destinataire afin de tracer les partages illicites.

**Acceptance Criteria:**
- [ ] Worker BullMQ invoque `audiowmark` en processus externe ; 128 bits = `watermark_id` opaque
- [ ] Protocole P2-C automatisé : ID décodé après ré-encodage mp3 128k, ogg, extrait 30 s, normalisation — un échec = story non passée
- [ ] Flag `watermarking` ; jamais dans le chemin de lecture

### S2-009 : Watermark visuel
**Description:** En tant que créateur, je veux un identifiant visuel indélébile sur les supports transmis afin que la capture d'écran reste traçable.

**Acceptance Criteria:**
- [ ] videowmark (ou incrustation périodique si insuffisant — ADR à ce moment) appliqué par le même worker
- [ ] Identifiant décodable sur capture d'écran du flux en lecture (protocole manuel documenté + preuve)

### S2-010 : Transmission de support [e2e]
**Description:** En tant que créateur, je veux remettre un support individualisé à un destinataire afin de partager sans perdre le contrôle.

**Acceptance Criteria:**
- [ ] Table `transmissions` conforme (RLS émetteur + destinataire ; `watermark_id` unique)
- [ ] Génération asynchrone : les DEUX watermarks présents sur l'artefact ; consultation en ligne uniquement
- [ ] Mention « Session remise à [prénom] » à l'ouverture (brand-brief)

### S2-011 : Référentiels culture → prénoms [CHECKPOINT AMINE]
**Description:** En tant que propriétaire du produit, je veux valider chaque référentiel culturel afin qu'aucun prénom inapproprié ne sorte.

**Acceptance Criteria:**
- [ ] Fichiers générés selon P2-B (≥ 20 prénoms/genre/culture, graphie AR + romanisation)
- [ ] Validation explicite d'Amine consignée AVANT activation du flag `rich_profile` en préprod

## Functional Requirements

- FR-1 : `session_events` append-only ; corrections = événements compensatoires.
- FR-2 : Une personnalité garde sa voix TTS toute la session (mapping dans `lineup`).
- FR-3 : Le live dégrade proprement si TTS indisponible (classe en texte, jamais de crash).
- FR-4 : Aucun flux user persisté si `recorded=false`.

## Non-Goals

- Multi-apprenants humains simultanés ; capture vidéo du live ; watermarking synchrone ; détection active de fuites (le traçage est rendu possible, l'exploitation est à la main d'Amine).

## Success Metrics

- 11/11 stories ; une session réelle enregistrée, rejouée fidèlement, transmise avec double watermark décodé.

## Open Questions

- Validation prénoms/cultures (S2-011) ; « classes mixtes » incluait-il plusieurs humains dès v1 ? (si oui : ADR-205 saute, chantier dédié à cadrer).
[/PRD]
