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

## ADR-204 — Watermarking : traitement asynchrone par transmission, conformité à décider (EN ATTENTE)

- **Faits établis** : audiowmark est sous GPL-3.0, encode un message opaque de 128 bits, se décode à l'aveugle et son protocole documenté vise notamment la résistance aux ré-encodages MP3/OGG. AudioSeal est publié sous licence MIT, mais son message optionnel est limité à 16 bits : il ne satisfait donc pas tel quel le protocole Qalem à 128 bits.
- **Architecture retenue sous réserve** : après S2-010, un job borné et idempotent traite une copie de l'artefact source par transmission ; aucun marquage ne s'exécute dans le chemin de lecture. L'identifiant est généré côté serveur et son lien avec le destinataire reste exclusivement dans `transmissions`. Le binaire audiowmark, s'il est retenu, vit dans un sidecar local dédié avec clé de watermark injectée par coffre.
- **Point non tranché** : invoquer un binaire GPL dans un processus séparé est une séparation technique ; ce n'est pas, à elle seule, une conclusion sur les obligations de licence. Avant toute distribution d'image, déploiement on-premise ou promesse commerciale incluant ce composant, une décision de conformité doit couvrir le modèle de distribution, les obligations applicables et le plan d'inventaire des licences.
- **Options soumises à décision** : (A) audiowmark, après validation de conformité, pour conserver le protocole opaque à 128 bits ; (B) AudioSeal MIT, uniquement après modification explicite de l'exigence produit ou conception hybride démontrant une traçabilité équivalente ; (C) ne pas exposer le watermark tant que le prérequis de conformité n'est pas levé.
- **Sources** : [audiowmark — licence et protocole](https://github.com/swesterfeld/audiowmark) ; [documentation audiowmark](https://uplex.de/audiowmark/README.html) ; [AudioSeal — licence et capacité de message](https://github.com/facebookresearch/audioseal).
- **Alternatives rejetées à ce stade** : service cloud (souveraineté du traçage) ; watermark maison (non éprouvé) ; marquage synchrone (latence dans le chemin utilisateur).

## ADR-205 — Multi-apprenants humains : HORS v1, chantier dédié (ACTÉE)

- **Quoi** : la classe v1 = un utilisateur + ses agents ; « classes mixtes » désigne la mixité du CASTING d'agents.
- **Pourquoi** : le multi-humains ajoute présence temps réel, tours de parole, modération — un chantier entier ; le point central de la vision (agents en live avec l'utilisateur) n'en dépend pas.
- **Réexamen** : décision produit d'Amine + S2-005 stable en usage réel. Si la lecture d'Amine de « classes mixtes » incluait PLUSIEURS humains dès la v1 → le signaler immédiatement, cette ADR saute.
