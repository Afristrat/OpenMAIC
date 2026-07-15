# 02 — Data dictionary · Chantier 1 — CRÉER

> **Fil conducteur** — Hérite des conventions du 0-SOCLE (snake_case, contraintes SQL d'abord, RLS partout, PII marquée). Les tables ci-dessous s'AJOUTENT au schéma porté. Le chantier 2 référencera `courses` (une classe vit une formation) ; le chantier 3 aussi (les graines dérivent d'un course).

## Choix structurant

Une entité pivot unique **`courses`** (la « formation prête »), quelle que soit la porte d'entrée (générée, importée, catalogue) — le chantier 2 lance une classe depuis un `course_id` sans savoir d'où il vient. La provenance est une colonne, pas trois tables.

## Tables

### `courses` — formation prête (pivot des 3 portes)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk, default gen_random_uuid() | — | n |
| owner_id | uuid | not null, fk → auth.users | Créateur | o (lien) |
| org_id | uuid | fk → organizations, nullable | Rattachement organisation | n |
| title | text | not null | Titre | n |
| language | text | not null, check (language in ('fr-FR','ar-MA','en-US')) | Langue principale | n |
| source_kind | text | not null, check (source_kind in ('generated','imported','catalog_copy')) | Porte d'entrée | n |
| import_id | uuid | fk → course_imports, nullable, check ((source_kind='imported') = (import_id is not null)) | Provenance import | n |
| outline | jsonb | not null | Outline structurée (format pipeline) | n |
| status | text | not null, default 'draft', check (status in ('draft','ready','archived')) | Seul `ready` est lançable en classe | n |
| catalog_visible | boolean | not null, default false | Publié au catalogue interne | n |
| created_at / updated_at | timestamptz | not null, default now() | — | n |

### `course_imports` — dépôt de contenu utilisateur (porte 3)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| owner_id | uuid | not null, fk → auth.users | Déposant | o (lien) |
| original_filename | text | not null | Nom du fichier déposé | o (possible) |
| storage_path | text | not null | Emplacement Supabase Storage | n |
| canvas_version | text | not null | Version du canevas contre lequel validé | n |
| validation_status | text | not null, default 'pending', check (validation_status in ('pending','conform','rejected')) | Verdict canevas | n |
| validation_report | jsonb | not null, default '[]' | Écarts listés (vide si conforme) | n |
| created_at | timestamptz | not null, default now() | — | n |

⚠️ Les COLONNES de structure du canevas lui-même ne sont pas figées ici : elles dérivent du canevas co-validé (checkpoint S1-002) — assumé en ADR-104, mise à jour de ce fichier dans le commit de S1-003.

### `export_jobs` — exports asynchrones (PPTX, SCORM)

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk | — | n |
| course_id | uuid | not null, fk → courses | Source | n |
| requested_by | uuid | not null, fk → auth.users | Demandeur | o (lien) |
| format | text | not null, check (format in ('pptx','scorm12','scorm2004','cmi5')) | Deux couches : le package est le même, l'adaptateur change | n |
| status | text | not null, default 'queued', check (status in ('queued','running','done','failed')) | Suivi BullMQ | n |
| artifact_path | text | check ((status='done') = (artifact_path is not null)) | Fichier produit | n |
| error | text | nullable | Cause d'échec | n |
| created_at / updated_at | timestamptz | not null, default now() | — | n |

RLS : accès par `owner_id`/membres `org_id` ; catalogue : lecture des `courses` où `catalog_visible = true` et `status = 'ready'`.
