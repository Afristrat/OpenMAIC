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

## ADR-203 — Audio du replay : pistes TTS PERSISTÉES, pas re-synthétisées (ACTÉE)

- **Quoi** : les pistes audio générées en live sont stockées (`audio_path`) et rejouées telles quelles au replay.
- **Pourquoi** : fidélité totale (« comme un vrai webinaire » — la même voix dit la même chose) ; la re-synthèse dépend de la disponibilité GPU (contention `.7` documentée) et peut différer (non-déterminisme TTS) ; l'angle mort « replay ≠ capture du TTS réel » (stress-test) se ferme par la persistance.
- **Mesure S2-004** : la session contrôlée du 2026-09-06, composée de cinq événements et d’une piste Higgs TTS, occupe réellement 173 890 octets, soit 0,165834 Mio : 172 844 octets d’audio et 1 046 octets de JSON. Cette valeur est un plancher à une piste, pas une projection d’une formation complète ; le suivi d’exploitation doit agréger `audio_bytes` avant tout dimensionnement commercial.
- **Coût accepté** : persister les pistes reste retenu pour la fidélité. Une compression ou un quota ne sera introduit que si les mesures de sessions longues le justifient.
- **Alternatives rejetées** : re-synthèse au replay (infidèle + fragile) ; pas d'audio au replay (ce ne serait plus un webinaire).

## ADR-204 — AudioSeal MIT : watermark asynchrone par transmission (ACTÉE)

- **Décision** : Qalem retient AudioSeal sous licence MIT, exécuté dans un sidecar local isolé. Aucun artefact ne quitte l’infrastructure Qalem et aucun marquage ne se produit dans le chemin de lecture.
- **Justification** : le dépôt officiel place le code et les poids AudioSeal sous MIT. Le canal de message natif est limité à 16 bits ; Qalem encode donc son `watermark_id` opaque de 128 bits dans onze segments de deux secondes, avec contrôle d’intégrité, et échoue fermement si la recomposition est incomplète ou contradictoire.
- **Architecture** : le worker BullMQ télécharge la copie source privée, appelle le sidecar borné puis conserve l’audio dérivé privé. Le worker visuel remplace la piste sonore de la vidéo dérivée ; la source originale reste inchangée. Le flag global `watermarking` reste désactivé tant que le protocole P2-C n’est pas prouvé.
- **Précondition de livraison** : le sidecar, sa limite mémoire, les onze segments et la résistance MP3 128 kbit/s, OGG, normalisation et extrait de trente secondes doivent être mesurés avant toute activation. Cette décision de licence ne vaut pas validation de robustesse.
- **Sources** : [licence AudioSeal](https://github.com/facebookresearch/audioseal/blob/main/LICENSE) ; [README AudioSeal : message 16 bits et poids MIT](https://github.com/facebookresearch/audioseal).
- **Alternatives rejetées** : audiowmark GPL-3.0 (périmètre de distribution à gouverner), service cloud (souveraineté du traçage), watermark maison (non éprouvé), marquage synchrone (latence utilisateur).

## ADR-205 — Multi-apprenants humains : HORS v1, chantier dédié (ACTÉE)

- **Quoi** : la classe v1 = un utilisateur + ses agents ; « classes mixtes » désigne la mixité du CASTING d'agents.
- **Pourquoi** : le multi-humains ajoute présence temps réel, tours de parole, modération — un chantier entier ; le point central de la vision (agents en live avec l'utilisateur) n'en dépend pas.
- **Réexamen** : décision produit d'Amine + S2-005 stable en usage réel. Si la lecture d'Amine de « classes mixtes » incluait PLUSIEURS humains dès la v1 → le signaler immédiatement, cette ADR saute.

## ADR-206 — Watermark visuel : incrustation persistante de l’identifiant opaque (ACTÉE)

- **Quoi** : le worker BullMQ génère une dérivée MP4 privée après le rendu de la source. L’identifiant opaque de 128 bits est incrusté dans chaque image, sous forme lisible, dans un cartouche discret en bas à droite. Le flux ne sert jamais la source non marquée.
- **Pourquoi** : cette option emploie FFmpeg et Sharp déjà présents dans l’image Qalem, n’ajoute ni service tiers ni dépendance sous licence à trancher, et rend l’identifiant décodable depuis une capture normale du flux. Le traitement reste borné, asynchrone et idempotent par transmission.
- **Limite explicite** : « indélébile » signifie ici incrusté dans le MP4 servi, pas DRM ni résistance cryptographique à un recadrage malveillant. Toute promesse de robustesse contre des attaques de transformation doit passer le protocole P2-C avant d’être revendiquée.
- **Alternatives rejetées** : `videowmark`, car sa compatibilité et sa licence doivent être instruites avec le même niveau d’exigence qu’audiowmark ; texte injecté dans le lecteur, car il disparaîtrait d’une capture ou d’un téléchargement ; QR code, car aucune dépendance QR n’est nécessaire pour décoder un identifiant textuel opaque sur une capture.

## ADR-207 — Enregistrement : GO DPO pour développement, production désarmée (ACTÉE)

- **Décision** : Med Amine MANSOURI IDRISSI, DPO et gérant d’AIMPower SARL A.U., a donné son « Go DPO » le 3 septembre 2026 à 22 h 18 (UTC+1).
- **Portée** : S2-004 et ses dépendantes peuvent être développées et testées avec consentement explicite non précoché, conservation par défaut de 30 jours, stockage privé auto-hébergé, absence d’usage biométrique, streaming sans téléchargement et suppression effective.
- **Limite** : le flag d’enregistrement reste désactivé en production jusqu’à la confirmation et à la consignation de la formalité CNDP applicable, puis jusqu’aux preuves de toutes les mesures exigées par la DPIA.
- **Source de vérité** : `docs/foundation/2-vivre/DPIA-S2-004.md`.
