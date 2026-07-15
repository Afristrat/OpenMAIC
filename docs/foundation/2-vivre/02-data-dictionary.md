# 02 — Data dictionary · Chantier 2 — VIVRE

> **Fil conducteur** — Hérite des conventions du 0-SOCLE ; référence `courses` (chantier 1) ; le chantier 3 lira `live_sessions` et `session_events` (quiz joués, moments saillants → graines, évaluations).

## Tables

### `user_profiles` — extension du profil (l'existant porté = pseudo + avatar ; on enrichit)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| user_id | uuid | pk, fk → auth.users | — | o |
| culture | text | not null, default 'ma-fr' | Référentiel culturel pour les prénoms du casting (ex. `ma-ar`, `ma-fr`, `fr`, `en`) — liste validée par Amine | **o** |
| ui_language | text | not null, check (in ('fr-FR','ar-MA','en-US')) | Langue d'interface | o |
| preferences | jsonb | not null, default '{}' | Préférences d'expérience (rythme, humour accepté…) — consommées par le casting | o |
| updated_at | timestamptz | not null, default now() | — | n |

### `castings` — état de variation par user × formation (garantie « toujours inédit »)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| user_id | uuid | not null, fk → auth.users | — | o (lien) |
| course_id | uuid | not null, fk → courses | — | n |
| session_no | integer | not null, default 1 | N-ième session de ce couple | n |
| lineup | jsonb | not null | Personnalités + prénoms + voix retenus pour LA session | n |
| lineup_hash | text | not null | Empreinte du lineup — la contrainte d'unicité ci-dessous EST la garantie de variation | n |
| created_at | timestamptz | not null, default now() | — | n |
| | | **unique (user_id, course_id, lineup_hash)** | Deux sessions du même couple ne peuvent pas avoir le même casting (invariante en SQL, règle Ponytail) | |

### `live_sessions` — une session vécue

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| course_id | uuid | not null, fk → courses | — | n |
| user_id | uuid | not null, fk → auth.users | — | o (lien) |
| casting_id | uuid | not null, fk → castings | Équipe du jour | n |
| recorded | boolean | not null, default false | Consentement d'enregistrement EXPLICITE (07-legal) | n |
| started_at | timestamptz | not null, default now() | — | n |
| ended_at | timestamptz | check (ended_at is null or ended_at >= started_at) | — | n |

### `session_events` — LE flux d'événements (replay + matière du chantier 3)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | bigint | pk, generated always as identity | Ordre total | n |
| session_id | uuid | not null, fk → live_sessions | — | n |
| ts_ms | integer | not null, check (ts_ms >= 0) | Horodatage relatif au début | n |
| actor | text | not null, check (actor in ('agent','user','system')) | Qui | n |
| event_type | text | not null | speech, action scénique, quiz_answer, user_message… | n |
| payload | jsonb | not null | Contenu (texte, référence audio, action) | **o si actor='user'** |
| audio_path | text | nullable | Piste audio persistée (ADR-203) | o (voix user) |

Écriture en append-only (aucun UPDATE applicatif — l'intégrité du replay en dépend) ; partitionnement à considérer quand le volume le justifie (parking lot).

### `transmissions` — supports transmis avec watermark

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| course_id | uuid | not null, fk → courses | Support source | n |
| recipient_user_id | uuid | not null, fk → auth.users | Destinataire — l'identité encodée dans le watermark | **o** |
| watermark_id | text | not null, unique | Identifiant 128 bits encodé (sonore + visuel) | o (pseudonymisé) |
| status | text | not null, default 'queued', check (in ('queued','processing','done','failed')) | Job BullMQ | n |
| artifact_path | text | check ((status='done') = (artifact_path is not null)) | Artefact marqué (consultation en ligne uniquement) | n |
| created_at / updated_at | timestamptz | not null, default now() | — | n |

RLS : `user_profiles`/`castings`/`live_sessions`/`session_events` accessibles à leur `user_id` seul (+ rôle service) ; `transmissions` : émetteur + destinataire.
