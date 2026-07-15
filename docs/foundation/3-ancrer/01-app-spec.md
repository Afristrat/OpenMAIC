# 01 — App-spec · Chantier 3 — ANCRER (10-90 jours post-formation)

> **Fil conducteur** — Amont : 2-VIVRE (chaque session vécue produit quiz joués, moments saillants, évaluation à chaud — la matière première d'ici). Le contenu des graines dérive des personnalités (blague du Rigolo, synthèse du Secrétaire…) : la voix vient du 4-MOTEUR. Aval : le reporting complet (Kirkpatrick) referme la boucle vers le créateur du course (chantier 1).

## Ce qu'on construit (verbatim Amine)

« L'app mobile post-formation continue à envoyer des push, anecdotes, points saillants ou blagues **comme des graines** […] **10 à 90 jours post-formation** avec un **suivi des quiz**, des **évaluations à chaud et à froid**. »

Quatre blocs :

1. **Générateur de graines** : à la fin d'une formation, un stock de graines est généré depuis la session vécue (anecdotes, points saillants, blagues — dans le registre des personnalités du casting) — ADR-301 : stock à la création, pas de génération au fil de l'eau.
2. **Calendrier d'ancrage** : planification BullMQ des envois sur 10-90 jours (espacement croissant, aligné sur FSRS porté) ; canal = push PWA (le seul canal réel du code — ADR-303).
3. **Suivi des quiz** : rappels de quiz espacés (FSRS), suivi des résultats dans le temps.
4. **Évaluations à chaud et à froid** : à chaud = fin de session (chantier 2 pose le hook) ; à froid = J+30/J+60 selon plan — les deux alimentent le reporting (Kirkpatrick L1 existant → L2/L3 par ces mesures) ; émission xAPI optionnelle vers LRS externe.

## Parcours critique

1. Fin de session live → évaluation à chaud (2 questions, 30 secondes) → le plan d'ancrage se crée automatiquement (opt-in explicite : « votre équipe continue avec vous 90 jours ? »).
2. J+3 : première graine push (« Le Rigolo vous rappelle… ») → tap → ouverture PWA sur la carte graine + mini-quiz optionnel.
3. J+10/J+30/J+60 : graines + rappels quiz espacés ; J+30 : évaluation à froid courte.
4. Tableau de bord apprenant : « votre ancrage » (ce qui tient, ce qui s'efface — courbe FSRS vulgarisée).
5. Côté créateur/organisation : reporting consolidé (participation, rétention mesurée, à chaud vs à froid).

## Ce que la v1 EXCLUT (les 3 refus)

1. **Pas de canaux e-mail/WhatsApp** — placeholders dans le code porté, et l'ancrage n'en dépend pas : push PWA d'abord (ADR-303) ; WhatsApp = parking lot avec son coût propre (API Business, opt-in réglementé).
2. **Pas de génération de graines à chaque envoi** — le stock est généré une fois (coût LLM borné, contenu cohérent avec LA session vécue) ; regénération = parking lot.
3. **Pas de Kirkpatrick L4 (impact business)** en v1 — L1/L2/L3 mesurables par la plateforme ; L4 exige des données métier du client (hors périmètre tant qu'un client réel ne les fournit pas).

## Hypothèses restantes et leur test

| Hypothèse | Test | Critère de réfutation |
|---|---|---|
| Le push PWA atteint réellement les utilisateurs mobiles cibles (iOS inclus) | S3-002 : test sur iOS Safari ≥ 16.4 réel + Android | Taux de délivrance inutilisable sur un OS majeur → réouvrir ADR-303 (natif ou canal alternatif) avec Amine |
| Les graines dérivées de la session sont perçues comme « inédites » et pas répétitives | Lot pilote : 90 jours simulés en accéléré, revue humaine du stock | Répétitivité flagrante → enrichir la génération (matière personnalités, chantier 4) |
| L'extracteur FSRS porté peut ancrer des items liés aux objectifs (lien Bloom absent aujourd'hui — dette identifiée) | S3-005 | Lien impossible sans refonte extracteur → story dédiée de pioche + ADR |

## Traçabilité verdict

GO option C′ (np-cadrage §7). Niveau L99. Checkpoints humains : ton des graines (échantillon validé par Amine avant activation), fréquences d'envoi (proposées, il tranche).
