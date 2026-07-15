# 03 — Directives Claude · Chantier 2 — VIVRE

> **Fil conducteur** — Hérite du `0-socle/03` (tronc) et des règles CRÉER applicables (flags, TTS). Spécifique au cœur de la plateforme.

## Spécifique au chantier

1. **Le point central ne se dégrade jamais** : toute story qui toucherait le live multi-agents (director, actions, TTS) doit prouver par e2e que la classe parle encore AVANT `passes=true` — c'est LA feature, pas une feature.
2. **Casting** : la garantie de variation est une CONTRAINTE SQL (`unique (user_id, course_id, lineup_hash)`) — jamais une vérification applicative seule. Les référentiels culture→prénoms sont des DONNÉES (fichiers de données versionnés), jamais du code en dur ; leur contenu est validé par Amine avant mise en ligne (matière culturellement sensible).
3. **Replay** : `session_events` est append-only — aucun UPDATE applicatif sur cette table ; toute correction = événement compensatoire. Le replay se construit en ÉTENDANT `lib/playback/` porté (copier-adapter), pas en le réécrivant.
4. **Jamais de fichier téléchargeable** pour live/replay : aucune route ne sert un artefact de session en `Content-Disposition: attachment` ; streaming seulement. Toute story d'export vérifie cette règle en review.
5. **Watermark** : toujours en job BullMQ (jamais dans le chemin de lecture) ; l'ID encodé est un identifiant OPAQUE (`watermark_id`) — le lien vers l'utilisateur ne vit que dans la table `transmissions` (pseudonymisation, cf. 07-legal).
6. **Enregistrement = consentement d'abord** : aucune écriture dans `session_events` avec `recorded=true` sans action explicite de l'utilisateur dans l'UI (et le flux user n'est persisté QUE si recorded).
7. **Prénoms/voix des agents** : chaque personnalité garde une voix TTS cohérente au sein d'une session (mapping dans `lineup`) ; changement de voix en cours de session = bug.
8. **DPIA avant build** : les stories d'enregistrement (S2-004+) sont BLOQUÉES tant que la DPIA du 07-legal n'est pas instruite — c'est un gate, pas une formalité.

## Pointeurs

`02-data-dictionary.md` (5 tables du chantier) · `04-feature-backlog.md` · `05-integrations.md` (audiowmark/audioseal) · ADR : `08-decisions-log.md` (2xx) · transverses : `0-socle/08`.
