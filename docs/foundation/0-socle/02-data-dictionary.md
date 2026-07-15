# 02 — Data dictionary · Chantier 0 — SOCLE

> **Fil conducteur** — Amont : 01-app-spec (le chantier porte, il n'invente pas). Aval : les data-dictionaries des chantiers 1-3 AJOUTENT leurs tables à celles listées ici ; toute nouvelle table/colonne de n'importe quel chantier se vérifie d'abord contre CE fichier puis contre celui de son chantier, et toute création met le fichier concerné à jour dans le même commit.

## Principe du chantier 0

Le socle **n'introduit aucune nouvelle table métier**. Il (a) fige les conventions, (b) inventorie le schéma Supabase existant porté tel quel, (c) ajoute l'unique table d'infrastructure commune demandée par le cadrage (feature flags — np-cadrage §5, chantier 0).

## Conventions (opposables à tous les chantiers)

- Tables et colonnes SQL : `snake_case`. Identifiants applicatifs (composants React, fonctions TS) : conventions de leur langage.
- Toute invariante exprimable en SQL s'exprime en **contrainte de base** (not null, unique, check, fk) avant tout code applicatif (règle Ponytail, échelon natif). Une validation purement applicative d'une invariante SQL-exprimable se justifie en ADR.
- **RLS activé sur chaque table, sans exception**, policies testées (règle absolue CLAUDE.md global).
- Colonnes PII marquées ici → alimentent 07-legal-compliance.

## Schéma existant porté (source de vérité : migrations Supabase du repo, copiées telles quelles)

Le schéma des 72 stories (organisations, classrooms, certificats, usage/billing, curriculum, spaced repetition…) est porté **par copie des migrations existantes** — il n'est PAS re-documenté table par table ici : la source de vérité reste `supabase/migrations/` copié dans la nouvelle base (story S0-003). Règle : si une table portée est jugée « à abandonner » par la liste garder/abandonner (checkpoint Amine, S0-011), sa migration est retirée AVANT la bascule prod, jamais après.

## Table ajoutée par le chantier 0

### `feature_flags`

| Colonne | Type | Contraintes | Description | PII |
|---|---|---|---|---|
| id | uuid | pk, default gen_random_uuid() | Identifiant | n |
| flag_name | text | not null, unique | Nom du flag (ex. `live_recording`, `seed_pushes`) | n |
| enabled | boolean | not null, default false | État global | n |
| scope | text | not null, default 'global', check (scope in ('global','org','user')) | Granularité d'activation | n |
| description | text | not null | À quoi sert le flag, quel chantier le possède | n |
| created_at | timestamptz | not null, default now() | Création | n |
| updated_at | timestamptz | not null, default now() | Dernière modification | n |

RLS : lecture authentifiée ; écriture réservée au rôle service. Justification : les chantiers 1-3 livrent en continu sur la base unique — chaque feature en cours s'abrite derrière un flag plutôt que derrière une branche longue (ADR-006, dossier 0/08).

**Choix structurant** : pas de table `flag_overrides` (par org/user) tant qu'aucun chantier n'en a l'usage réel — YAGNI ; condition de sortie du parking lot : premier besoin d'activation partielle (pilote org) au chantier 2 ou 3.
