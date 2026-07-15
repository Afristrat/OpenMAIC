# 02 — Data dictionary · Chantier 3 — ANCRER

> **Fil conducteur** — Hérite des conventions du 0-SOCLE ; référence `courses` (1-CRÉER) et `live_sessions` (2-VIVRE). Le schéma FSRS porté (`lib/spaced-repetition/`) reste la référence pour la mémoire espacée — les tables ci-dessous s'y articulent sans le dupliquer.

## Tables

### `seeds` — le stock de graines d'une session

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| session_id | uuid | not null, fk → live_sessions | Session source (la graine cite CE qui a été vécu) | n |
| persona | text | not null | Personnalité émettrice (registre de voix) | n |
| kind | text | not null, check (kind in ('anecdote','highlight','joke','quiz_reminder')) | Type de graine | n |
| content | jsonb | not null | Texte + accroche push + référence scène | n |
| status | text | not null, default 'pending', check (status in ('pending','scheduled','sent','skipped')) | Cycle de vie | n |
| created_at | timestamptz | not null, default now() | — | n |

### `anchor_plans` — le plan 10-90 jours (opt-in)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| session_id | uuid | not null, unique, fk → live_sessions | Un plan par session vécue | n |
| user_id | uuid | not null, fk → auth.users | — | o (lien) |
| opted_in_at | timestamptz | not null | Consentement explicite (jamais de plan sans opt-in) | n |
| paused | boolean | not null, default false | Pause utilisateur (un tap) | n |
| ends_at | timestamptz | not null | Borne dure ≤ J+90 (check en trigger vs opted_in_at + 90 j) | n |

### `anchor_deliveries` — chaque envoi planifié/effectué

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| plan_id | uuid | not null, fk → anchor_plans | — | n |
| seed_id | uuid | fk → seeds, nullable | Graine envoyée (null si rappel quiz/éval) | n |
| delivery_kind | text | not null, check (in ('seed','quiz_reminder','cold_eval')) | Nature | n |
| scheduled_for | timestamptz | not null | Date planifiée (job BullMQ) | n |
| sent_at | timestamptz | nullable | Envoi effectif | n |
| opened_at | timestamptz | check (opened_at is null or sent_at is not null) | Engagement mesuré | n |

### `evaluations` — à chaud et à froid

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| session_id | uuid | not null, fk → live_sessions | — | n |
| user_id | uuid | not null, fk → auth.users | — | o (lien) |
| phase | text | not null, check (phase in ('hot','cold_30','cold_60')) | Moment de mesure | n |
| answers | jsonb | not null | Réponses structurées | o (possible, texte libre) |
| score | numeric | check (score between 0 and 100), nullable | Consolidé pour reporting | n |
| created_at | timestamptz | not null, default now() | — | n |
| | | **unique (session_id, user_id, phase)** | Une mesure par phase (invariante SQL) | |

### `xapi_outbox` — émission xAPI optionnelle (fil vers LRS externe)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | bigint | pk, identity | — | n |
| statement | jsonb | not null | Statement xAPI conforme | o (acteur pseudonymisé) |
| lrs_target | text | not null | Config LRS de l'org | n |
| status | text | not null, default 'queued', check (in ('queued','sent','failed')) | Retry par worker | n |
| created_at / updated_at | timestamptz | not null, default now() | — | n |

RLS : par `user_id` (+ org pour le reporting consolidé, lecture agrégée seulement).
