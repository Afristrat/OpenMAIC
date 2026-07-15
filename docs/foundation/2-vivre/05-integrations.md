# 05 — Intégrations · Chantier 2 — VIVRE

> **Fil conducteur** — S'ajoute aux tableaux du 0-SOCLE et du 1-CRÉER (non recopiés). Les ajouts ci-dessous portent le watermarking et le replay — chacun avec ADR Ponytail.

| Service / dépendance | Usage | Clé/compte | Coût/limites | Criticité | Repli |
|---|---|---|---|---|---|
| `audiowmark` (swesterfeld, binaire CLI) | Watermark sonore 128 bits inaudible, décodage aveugle | — (binaire local, job BullMQ) | GPL ; CPU par artefact — d'où le job async | Oui (transmission seulement) | `audioseal` (facebookresearch) en second (ADR-204) |
| `videowmark` (même projet) | Watermark visuel des supports vidéo | — (binaire local) | idem | Oui | Incrustation périodique maison (échelon plateforme) si insuffisant |
| Supabase Storage | Pistes audio persistées (`session_events.audio_path`), artefacts marqués | `SRV_SUPABASE_*` (socle) | espace disque serveuria — surveiller | ❌ Non pour le replay audio | Politique de rétention + nettoyage des sessions supprimées |
| Higgs TTS (socle) | Voix des agents en live ; pistes réutilisées au replay (ADR-203) | endpoint interne | ⚠️ contention GPU (socle) | ❌ Non — la classe parle | File + retry ; provider alternatif par config |

## Règles

1. **GPL d'audiowmark** : binaire invoqué en PROCESSUS EXTERNE par le worker (pas de linkage) — l'obligation GPL reste bornée au binaire ; notre code AGPL n'est pas affecté. Consigné en ADR-204 ; à re-vérifier si un jour on lie une bibliothèque au lieu d'invoquer le binaire.
2. **Aucun service cloud de watermarking** : la souveraineté du traçage (qui a partagé quoi) interdit d'envoyer les artefacts à un tiers.
3. Le stockage des pistes audio est le POSTE DE COÛT du chantier : mesurer (Mo/session réelle) dès S2-004 et consigner la mesure dans le 09-errors-log si elle contredit l'hypothèse de l'ADR-203.
