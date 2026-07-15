# 04 — Feature backlog · Chantier 2 — VIVRE

> **Fil conducteur** — Démarre à S0-008 verte (le live existant est porté par le socle : director LangGraph, actions, TTS). S2-001/S2-002 sont le QUICK-WIN désigné (point central de la vision, code nouveau, zéro conflit avec la carrière). S2-004/S2-005 produisent la matière du chantier 3.

## v1 gelée (stories Ralph, critères binaires)

| ID | Story | Critère d'acceptation (binaire) |
|---|---|---|
| S2-001 | Profil enrichi (`user_profiles` : culture, préférences) + écran de profil | Migration conforme au 02, RLS testée ; l'utilisateur choisit sa culture/langue ; e2e passe ; flag `rich_profile` |
| S2-002 | **QUICK-WIN** Casting personnalisé : personnalités + prénoms adaptés à la culture, classes mixtes | Le lineup dérive du profil (culture → référentiel de prénoms validé par Amine) ET du contenu ; mixité présente ; écran « votre équipe du jour » ; e2e en fr + ar |
| S2-003 | Variation garantie | Contrainte `unique (user_id, course_id, lineup_hash)` active ; test : 2 lancements consécutifs du même couple → lineups différents ; collision → re-tirage automatique |
| S2-004 | **[GATE DPIA]** Enregistrement du live : flux d'événements complet (agents + interventions UTILISATEUR) | Consentement UI explicite requis ; `session_events` capture speech agents, actions, messages/audio user ; append-only prouvé (pas d'UPDATE dans le code) |
| S2-005 | Replay « comme un vrai webinaire » | Une session enregistrée se rejoue intégralement (audio inclus, choix ADR-203) sur plateforme ET PWA ; AUCUNE route de téléchargement (test qui l'affirme) |
| S2-006 | Bibliothèque de replays | Liste « mes sessions », reprise à l'horodatage, suppression par l'utilisateur (droit effacement) ; e2e |
| S2-007 | Andragogie dans le live | Les interventions des agents consomment les overrides du moteur (interface chantier 4) ; test : un override actif change observablement le comportement d'une personnalité |
| S2-008 | Watermark sonore : audiowmark en job BullMQ | Artefact audio marqué (128 bits) → ré-encodé mp3 128k → `watermark_id` décodé avec succès (test automatisé) ; flag `watermarking` |
| S2-009 | Watermark visuel | Identifiant visuel indélébile (videowmark ou incrustation périodique) sur le support transmis ; décodable sur capture d'écran du flux (test manuel documenté) |
| S2-010 | Transmission de support | Table `transmissions` ; génération asynchrone de l'artefact marqué au nom du destinataire ; consultation en ligne uniquement ; les deux watermarks présents |
| S2-011 | **[CHECKPOINT AMINE]** Référentiels culture → prénoms | Fichiers de données proposés (cultures couvertes, prénoms mixtes par culture) ; validation explicite d'Amine AVANT le flag `rich_profile` en préprod |

## Parking lot (condition de sortie obligatoire)

| Item | Condition de sortie |
|---|---|
| Classe multi-apprenants humains simultanés | Décision produit Amine + S2-005 stable en usage réel (présence/tours de parole = chantier dédié) |
| ASR temps réel complet (parler à la classe au micro) | Si l'existant porté ne le couvre pas : story dédiée après S2-004 (le texte suffit au parcours critique v1) |
| Partitionnement de `session_events` | Volume réel le justifie (mesure, pas anticipation) |
| Détection active de partage illicite (crawler + décodage) | Premier cas réel de fuite OU demande d'Amine — la v1 rend le traçage POSSIBLE, l'exploitation est à sa main |
| Personnalités au-delà des 10 (« ou d'autres selon le profil ») | Moteur chantier 4 capable d'en générer — les 10 canoniques d'abord |
