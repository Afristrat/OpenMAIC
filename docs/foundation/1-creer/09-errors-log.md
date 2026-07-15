# 09 — Errors log · Chantier 1 — CRÉER

> **Fil conducteur** — Mêmes règles d'usage que `0-socle/09-errors-log.md` (bug > 15 min, cause racine, lire avant de déboguer). Amorcé avec les erreurs déjà payées ailleurs qui concernent CE chantier.

## Entrées (amorce — leçons importées)

### 2026-07-09 — VoxCPM : bruit de fond en production (payée sur Dīwān, importée ici)
- **Symptôme** : pistes TTS avec bruit de fond audible — inacceptable pour du contenu de formation.
- **Cause racine** : le provider produisait un plancher de bruit élevé, non détecté car aucun gate de qualité audio en sortie de synthèse.
- **Fix (côté Dīwān, à copier-adapter)** : déprovisionnement VoxCPM + garde-fou `noise_floor_db()` (seuil -50 dB) rejetant toute piste bruitée.
- **Leçon** : JAMAIS de piste TTS publiée sans gate de plancher de bruit — c'est la story S1-009, non négociable. Un provider TTS se juge sur mesure, pas sur démo.

### 2026-07-09 — WebFetch 403 sur qalem.ai-mpower.com
- **Symptôme** : lecture de la landing bloquée (403) via l'outil WebFetch.
- **Cause racine** : filtrage user-agent côté infra.
- **Fix** : `curl -A "Mozilla/5.0..."` → 200.
- **Leçon** : pour vérifier une page de NOTRE infra, utiliser curl avec UA navigateur ; utile pour les vérifications e2e externes du chantier (catalogue public).

### Gabarit d'entrée

```
### AAAA-MM-JJ — Titre court
- **Symptôme** :
- **Cause racine** :
- **Fix** :
- **Leçon** :
```
