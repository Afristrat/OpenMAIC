# 02 — Data dictionary · Chantier 4 — MOTEUR

> **Fil conducteur** — Hérite des conventions du 0-SOCLE. Le moteur est un chantier de SAVOIR : sa matière vit en fichiers versionnés (manifests, prompts, référentiels), pas en tables. Ce document fige les conventions de ces fichiers et la SEULE surface base de données existante.

## Principe

**Aucune table nouvelle par défaut.** Le savoir andragogique se versionne en git (revue par diff, rollback, blame — exactement ce qu'exige la validation vecteur par vecteur). Une table n'apparaîtrait que si un vecteur validé exige du par-utilisateur dynamique (ex. réglages de moteur par org) — ce serait alors une mise à jour de CE fichier dans le même commit (règle du socle).

## Surface existante (portée par le socle — état de fait, pas une décision)

- `skills/{id}/manifest.json` chargé par `lib/skills/loader.ts` : agents i18n, `promptOverrides` (syntaxe `file:`), `classroomTemplates`.
- **Dette identifiée (à traiter par vecteur, pas en passant)** : `lib/skills/types.ts:55` — `Skill.name: string` alors que les manifests portent des `Record` i18n. Consignée au parking lot du 04.
- Consommateur réel actuel : `app/api/skills/route.ts` uniquement ; `getPromptOverride()` jamais appelé → le câblage est S1-001 (chantier 1), le CONTENU vient d'ici.

## Conventions des fichiers de savoir (opposables dès maintenant)

| Convention | Règle |
|---|---|
| Langue des prompts | La langue de la LOCALE cible (un override fr-FR s'écrit en français irréprochable ; ar-MA en arabe standard moderne) — jamais de prompt « pivot anglais » traduit à la volée |
| Nommage | `kebab-case.md` / `manifest.json` ; identifiants techniques en anglais |
| Traçabilité | Chaque fichier de savoir porte un en-tête : source (référence corpus), vecteur validé (numéro), date de validation Amine |
| Versionnage | Toute évolution de contenu = commit dédié référençant le vecteur — jamais mélangée à du code |
| i18n | Tout savoir exposé à l'UI existe dans les 3 locales ou déclare explicitement sa locale unique |

## Ce que ce fichier ne fait PAS

Il ne fige ni l'arborescence du corpus refondu, ni le mécanisme de synchronisation plateforme ↔ skill autonome — les deux sont des vecteurs à valider (01-app-spec, refus n°1).
