# 04 — Feature backlog · Chantier 3 — ANCRER

> **Fil conducteur** — Démarre quand le chantier 2 produit des sessions vécues (S2-004 minimum pour la matière réelle ; S3-001/S3-002 peuvent démarrer dès S0-008 sur données de test). Le reporting (S3-009) referme la boucle vers le créateur (chantier 1).

## v1 gelée (stories Ralph, critères binaires)

| ID | Story | Critère d'acceptation (binaire) |
|---|---|---|
| S3-001 | Tables du chantier (migrations conformes au 02) | 5 tables, contraintes actives (borne J+90, unicité phase), RLS testées |
| S3-002 | Push PWA de bout en bout re-vérifié (iOS + Android) | Push reçu appareil réel iOS Safari ≥ 16.4 ET Android ; tap → ouverture PWA sur la carte cible ; taux consigné |
| S3-003 | Évaluation à chaud (hook fin de session, chantier 2) | 2 questions en fin de session ; `evaluations(phase='hot')` écrite ; skippable sans friction ; e2e |
| S3-004 | Générateur de graines (stock à la fin de session) | Une session vécue → ≥ 12 graines typées citant les scènes sources, dans le registre des personas du casting et conformes à `formation-engine-consumer.json` ; coût LLM d’une génération consigné |
| S3-005 | Plan d'ancrage + planification BullMQ | Opt-in → deliveries planifiées à espacement croissant sur ≤ 90 j ; pause en un tap ; jobs rejouables ; flag `anchoring` |
| S3-006 | Rappels quiz espacés (FSRS porté) | Les items de quiz de la session entrent dans la file FSRS ; un rappel push ouvre le quiz ; résultat re-nourrit FSRS (test complet du cycle) |
| S3-007 | Évaluation à froid (J+30 / J+60) | Livraison `cold_eval` planifiée ; réponse écrite en `evaluations(phase='cold_30'/'cold_60')` ; unicité par phase prouvée |
| S3-008 | **[CHECKPOINT AMINE]** Ton des graines + fréquences | Échantillon de 20 graines réelles + plan de fréquence proposé → validation explicite avant activation du flag en préprod |
| S3-009 | Reporting ancrage (créateur/org) | Agrégats : participation, à chaud vs à froid, rétention quiz dans le temps — lecture seule org, aucun drill-down individuel ; e2e |
| S3-010 | Émission xAPI (optionnelle, par org) | Statements conformes (vérifiés contre un LRS de test) émis via outbox + retry ; acteur pseudonymisé ; flag `xapi_emission` |

## Parking lot (condition de sortie obligatoire)

| Item | Condition de sortie |
|---|---|
| Canal WhatsApp (API Business) | Décision Amine + client le réclamant — coût opt-in réglementaire propre |
| Canal e-mail | Un cas réel où le push PWA ne suffit pas (mesure S3-002) |
| Impact organisationnel attribuable | Premier client fournissant ses données métier et politique d’évaluation approuvée dans le moteur |
| Regénération de graines (stock épuisé/répétitif) | Mesure de répétitivité sur pilote (hypothèse 2 de l'app-spec réfutée) |
| Lien plan compilé → FSRS complet (dette extracteur) | S3-006 révèle la limite en usage réel → story de pioche dédiée |
| Digest hebdomadaire apprenant (« votre ancrage ») | Engagement mesuré des pushes unitaires d'abord |
