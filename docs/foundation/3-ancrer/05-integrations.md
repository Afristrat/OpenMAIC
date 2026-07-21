# 05 — Intégrations · Chantier 3 — ANCRER

> **Fil conducteur** — S'ajoute aux tableaux 0/1/2 (non recopiés). Le chantier est volontairement PAUVRE en dépendances : le push PWA, BullMQ et FSRS sont déjà dans la base portée — l'ancrage est un chantier d'orchestration, pas d'intégration.

| Service / dépendance | Usage | Clé/compte | Coût/limites | Criticité | Repli |
|---|---|---|---|---|---|
| Web Push (VAPID, service workers portés) | Canal unique des graines/rappels v1 | clés VAPID (coffre, nom à consigner à S3-002) | gratuit ; ⚠️ iOS : PWA installée + Safari ≥ 16.4 requis | ❌ Non pour l'ancrage (c'est LE canal) | Si délivrance iOS insuffisante (mesure S3-002) → réouvrir ADR-303 avec Amine |
| BullMQ / Redis (socle) | Planification 10-90 j, outbox xAPI | — | volume de jobs faible (quelques/jour/plan) | — (cf. socle) | — |
| FSRS (`lib/spaced-repetition/` porté) | Espacement des rappels quiz | — (lib interne) | dette : lien vers le plan compilé absent (parking lot) | — | — |
| LRS externe de l'org (xAPI, optionnel) | Réception des statements si l'org en a un | endpoint + credentials PAR ORG (jamais en dur ; stockage config org chiffrée) | selon LRS client | Oui — fonctionnalité optionnelle | Outbox conserve les statements en échec (retry + inspection) |

## Règles

1. **Aucun service d'engagement tiers** (OneSignal, Firebase Cloud Messaging au-delà du Web Push standard, analytics) : le Web Push standard suffit au parcours critique — tout ajout devra prouver l'échelon Ponytail.
2. Les credentials LRS des organisations sont des DONNÉES CLIENT : chiffrées, jamais dans le coffre personnel, accès service uniquement.
3. La mesure S3-002 (délivrance réelle iOS/Android) est la SOURCE DE VÉRITÉ du choix de canal — pas les articles de blog sur « le push PWA sur iOS ».
