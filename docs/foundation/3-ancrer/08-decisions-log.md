# 08 — Decisions log (ADR) · Chantier 3 — ANCRER

> **Fil conducteur** — ADR propres au chantier (numérotation 3xx) ; transverses au `0-socle/08`.

## ADR-301 — Graines : stock généré à la fin de session, pas au fil de l'eau (ACTÉE)

- **Quoi** : le générateur produit le stock complet (≥ 12 graines typées) à la clôture de la session ; les envois consomment le stock.
- **Pourquoi** : coût LLM borné et prévisible (1 génération vs 15+ appels étalés) ; cohérence garantie avec LA session vécue (le contexte est encore là) ; testable d'un bloc (S3-004). Compromis nommé dès le stress-test (np-cadrage §6).
- **Alternatives rejetées** : génération à chaque envoi (coût récurrent non borné, dépendance LLM à J+60 pour un push de 60 mots) ; graines génériques par course (contredit « ancrée dans le vécu »).
- **Réversibilité** : si le pilote montre de la répétitivité (hypothèse 2 de l'app-spec), la regénération sort du parking lot.

## ADR-302 — Évaluations à chaud/à froid en table dédiée, une mesure par phase (ACTÉE)

- **Quoi** : `evaluations` avec `phase in ('hot','cold_30','cold_60')` et `unique (session_id, user_id, phase)`.
- **Pourquoi** : la comparaison à chaud vs à froid est LA mesure de valeur du chantier (verbatim Amine « évaluations à chaud et à froids ») — elle exige des phases normées et une seule mesure par phase (sinon la courbe ment) ; l'invariante vit en SQL (règle Ponytail).
- **Alternatives rejetées** : réutiliser les réponses de quiz comme évaluation (mesure la mémoire, pas la perception/le transfert) ; phases libres (incomparables entre utilisateurs).

## ADR-303 — Canal v1 : push PWA uniquement (ACTÉE — dérive de l'ADR-003 du socle)

- **Quoi** : les graines/rappels partent en Web Push (service workers portés) ; e-mail et WhatsApp restent hors v1.
- **Pourquoi** : seul canal RÉEL du code porté (e-mail/WhatsApp = placeholders explicites `lib/notifications/index.ts`) ; zéro coût ; aligné « l'app pousse » (PWA installée = l'app). Limite CONNUE : iOS exige PWA installée + Safari ≥ 16.4 — d'où la mesure S3-002 en critère bloquant.
- **Sources** : audit code 2026-07-09 (np-cadrage §3) ; exigence de preuve appareil réel plutôt que documentation (règle n°4).
- **Alternatives rejetées** : WhatsApp Business (coût + opt-in réglementé + placeholder non câblé) ; e-mail (engagement faible pour des graines de 10 s, placeholder) ; app native (ADR-003 socle : PWA d'abord).

## ADR-304 — xAPI en émission sortante uniquement, via outbox (ACTÉE)

- **Quoi** : Qalem ÉMET des statements vers le LRS de l'org (pattern outbox + retry) ; Qalem n'héberge PAS de LRS.
- **Pourquoi** : la valeur est l'interopérabilité (l'org voit l'ancrage dans SON système — cohérent avec l'export deux couches ADR-101) ; héberger un LRS = un produit entier hors vision.
- **Alternatives rejetées** : LRS intégré (scope creep majeur) ; appels synchrones au LRS (couplage de disponibilité avec un système tiers — SOP-007).

## ADR-305 — Reporting org : agrégats seuls en v1 (ACTÉE)

- **Quoi** : aucune vue individuelle des évaluations/engagement offerte à l'organisation.
- **Pourquoi** : dérive de finalité documentée (07-legal §2 — l'éval à froid devient un outil RH) ; le reporting L1→L3 agrégé suffit à la promesse de valeur.
- **Alternatives rejetées** : drill-down individuel (exige base contractuelle explicite — décision Amine avec le contrat org, pas une option d'ingénierie).
