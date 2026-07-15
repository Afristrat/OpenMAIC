# 09 — Errors log · Chantier 2 — VIVRE

> **Fil conducteur** — Mêmes règles que `0-socle/09` (bug > 15 min, cause racine, lire avant de déboguer). Amorcé avec les pièges DÉJÀ identifiés qui coûteront des heures s'ils sont oubliés.

## Entrées (amorce — pièges connus)

### 2026-07-09 — `lib/playback/` ne rejoue PAS les interventions utilisateur (angle mort, pas encore payé)
- **Symptôme attendu** : un replay naïf construit sur le moteur existant rejouerait les agents mais PAS ce que l'utilisateur a dit/fait.
- **Cause racine** : le moteur actuel rejoue des séquences d'actions GÉNÉRÉES ; les événements utilisateur n'existent pas dans son modèle.
- **Prévention** : S2-004 étend le modèle d'événements à `actor in ('agent','user','system')` AVANT de toucher au player. Tout test de replay inclut au moins une intervention utilisateur.
- **Leçon** : « ça rejoue » ne veut rien dire — tester le rejeu du DIALOGUE, pas du monologue.

### 2026-07-09 — Contention GPU studio `.7` : `deepseek-on` coupe Higgs
- **Symptôme** : TTS en échec alors que « rien n'a changé » côté Qalem.
- **Cause racine** : le studio DGX-2 (`.7:7861`) est partagé — le déploiement DeepSeek coupe le service TTS.
- **Prévention** : SOP-007 (jamais de supposition sur un système tiers) : vérifier la disponibilité du endpoint AVANT de conclure à un bug Qalem ; le live doit dégrader proprement (classe en texte) plutôt que planter.
- **Leçon** : toute dépendance à une ressource partagée a un mode dégradé testé.

### Gabarit d'entrée

```
### AAAA-MM-JJ — Titre court
- **Symptôme** :
- **Cause racine** :
- **Fix** :
- **Leçon** :
```
