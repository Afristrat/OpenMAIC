# 08 — Decisions log (ADR) · Chantier 2 — VIVRE

> **Fil conducteur** — ADR propres au chantier (numérotation 2xx) ; transverses au `0-socle/08`.

## ADR-201 — Replay = flux d'événements rejoué, pas capture vidéo (ACTÉE)

- **Quoi** : l'enregistrement d'un live = suite d'événements horodatés (`session_events`, append-only) rejoués par extension de `lib/playback/` porté.
- **Pourquoi** : conforme « JAMAIS de fichier téléchargeable » par nature (un flux se streame, une vidéo se copie) ; léger (Ko vs Go) ; permet la reprise à l'horodatage ; réutilise le moteur existant (copier-adapter).
- **Sources** : `lib/playback/engine.ts` + `derived-state.ts` (audit 2026-07-09) ; compromis nommé au stress-test (np-cadrage §6).
- **Alternatives rejetées** : capture vidéo pixel (lourde, téléchargeable par nature, RTL/i18n figés au rendu) ; hybride (double coût sans besoin démontré).

## ADR-202 — Casting = profil × contenu × état de variation (ACTÉE dans le principe)

- **Quoi** : le lineup dérive (a) du profil (`culture`, `preferences`), (b) du contenu du course (l'existant porté : 1 teacher exigé, assistants selon matière), (c) de l'état `castings` qui interdit la répétition (contrainte SQL).
- **Pourquoi** : verbatim vision (« ou d'autres selon le profil […] toujours inédite ») ; l'angle mort identifié au stress-test (variation = état par user×formation à persister) se résout en base, pas en aléatoire applicatif (un `Math.random()` ne garantit rien).
- **Sources** : `app/api/generate/agent-profiles/route.ts` (casting actuel dérivé du contenu seul) ; np-cadrage §6.
- **Alternatives rejetées** : aléatoire sans état (répétitions possibles = promesse trahie) ; casting figé par formation (contredit « toujours inédite »).

## ADR-203 — Audio du replay : pistes TTS PERSISTÉES, pas re-synthétisées (PROPOSÉE — à confirmer par la mesure S2-004)

- **Quoi** : les pistes audio générées en live sont stockées (`audio_path`) et rejouées telles quelles au replay.
- **Pourquoi** : fidélité totale (« comme un vrai webinaire » — la même voix dit la même chose) ; la re-synthèse dépend de la disponibilité GPU (contention `.7` documentée) et peut différer (non-déterminisme TTS) ; l'angle mort « replay ≠ capture du TTS réel » (stress-test) se ferme par la persistance.
- **Coût accepté** : stockage (à mesurer en Mo/session dès S2-004 — si prohibitif, compression agressive avant de reconsidérer).
- **Alternatives rejetées** : re-synthèse au replay (infidèle + fragile) ; pas d'audio au replay (ce ne serait plus un webinaire).

## ADR-204 — Watermarking : audiowmark/videowmark en processus externe, job async (ACTÉE, réversible S2-008)

- **Quoi** : binaires invoqués par le worker BullMQ, un artefact marqué par transmission ; `audioseal` en second si la robustesse déçoit.
- **Pourquoi** : audiowmark = 128 bits inaudibles, décodage aveugle, survit au ré-encodage ≥128 kbit/s (README du projet, lu 2026-07-09) ; l'invocation en processus externe borne la GPL au binaire ; async car le coût est PAR transmission (angle mort chiffré au stress-test).
- **Sources** : github.com/swesterfeld/audiowmark ; github.com/facebookresearch/audioseal (np-cadrage §3).
- **Alternatives rejetées** : service cloud (souveraineté du traçage) ; watermark maison (réinventer la roue, non éprouvé) ; marquage synchrone (latence dans le chemin utilisateur).

## ADR-205 — Multi-apprenants humains : HORS v1, chantier dédié (ACTÉE)

- **Quoi** : la classe v1 = un utilisateur + ses agents ; « classes mixtes » désigne la mixité du CASTING d'agents.
- **Pourquoi** : le multi-humains ajoute présence temps réel, tours de parole, modération — un chantier entier ; le point central de la vision (agents en live avec l'utilisateur) n'en dépend pas.
- **Réexamen** : décision produit d'Amine + S2-005 stable en usage réel. Si la lecture d'Amine de « classes mixtes » incluait PLUSIEURS humains dès la v1 → le signaler immédiatement, cette ADR saute.
