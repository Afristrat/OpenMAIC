# 05 — Intégrations · Chantier 1 — CRÉER

> **Fil conducteur** — S'ajoute au tableau du 0-SOCLE (Supabase, Higgs, LLM, Redis, Coolify inchangés — non recopiés). Chaque ajout ci-dessous a passé les échelons Ponytail 2-5 (rien dans la codebase/stdlib/plateforme ne le couvrait).

| Service / dépendance | Usage | Clé/compte (nom coffre) | Coût/limites | Criticité | Repli |
|---|---|---|---|---|---|
| Pipeline Hyperframes (repo `mishkat`, local/serveuria) | Capsules vidéo déterministes (brief JSON → IR → frames → mp4) | aucun (pipeline local) | GPU/CPU render local | Oui — dégradé (formation sans capsules) | File BullMQ + re-render ; la formation reste consommable sans vidéo |
| Adaptateurs natifs Qalem | Suivi SCORM 1.2, SCORM 2004 et cmi5 dans les packages exportés | — | Aucun runtime tiers embarqué | Oui (export seulement) | API LMS réelle, jamais simulée dans le SCO (ADR-106) |
| Moodle local (docker, éphémère) | Banc de test d'import des exports SCORM (S1-007/S1-008) | instance jetable, aucun compte externe | gratuit | Outil de test uniquement | Autre LMS docker (Ilias) si Moodle indisponible |
| MinerU (parse PDF, déjà supporté par la base) | Parsing des contenus importés (porte 3) | selon config existante `server-providers.yml` | selon déploiement | Oui — dégradé (formats texte seuls) | Parseur PDF alternatif du système multi-provider |
| Higgs TTS (déjà au socle) | Voix capsules + gate tachkil/noise-floor | endpoint interne | ⚠️ AR non définitif (dixit Amine) | — (cf. socle) | Provider TTS alternatif par config |

## Règles

1. **Dīwān n'est PAS une dépendance runtime** : on copie-adapte ses CONCEPTS prouvés (tachkil `vocalization.py`, `noise_floor_db()` -50 dB, profils podcasts) dans le code Qalem — lecture seule sur son repo, zéro appel réseau vers lui.
2. **Mishkāt** : intégration par interface de fichiers (brief JSON déposé, mp4 récupéré) tant que S1-006 ne prouve pas qu'un couplage plus fort est indispensable — toute évolution du repo mishkat se demande à SA session propriétaire.
3. Chaque nouvelle dépendance npm de ce chantier (scorm-again incluse) = entrée ADR avec preuve Ponytail (échelon inférieur insuffisant).
