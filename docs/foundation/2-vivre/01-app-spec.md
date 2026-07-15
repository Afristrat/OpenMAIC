# 01 — App-spec · Chantier 2 — VIVRE (le cœur de la plateforme)

> **Fil conducteur** — Amont : 0-SOCLE (base verte) + 1-CRÉER (toute formation `ready`, quelle que soit sa porte d'entrée, est l'input de ce chantier via `course_id`). Aval : chaque session vécue produit la matière première du 3-ANCRER (quiz joués, moments saillants pour les graines, évaluation à chaud). Le 4-MOTEUR fournit l'andragogie injectée dans le live.

## Ce qu'on construit

**Le point central de la vision (verbatim Amine)** : chaque formation initiée est **automatiquement lancée avec des agents IA interactifs, en classe avec l'utilisateur, en live comme un vrai webinaire** — les 10 personnalités (Professeur, Assistant Pédagogique, le Rigolo, le Curieux, le Secrétaire, le Penseur, l'Analyste, le Coach, l'Avocat du Diable, le Créatif) **ou d'autres selon le profil de l'utilisateur**, pour une expérience **toujours inédite, toujours supérieure aux attentes**. Classes **mixtes**, **prénoms adaptés à la culture de l'utilisateur**.

Quatre blocs :

1. **Casting personnalisé** : profil utilisateur enrichi (culture, langue, préférences) → sélection des personnalités + prénoms culturellement adaptés + mixité garantie ; **variation garantie** entre sessions (état persisté par user × formation — jamais deux castings identiques consécutifs).
2. **Le live** : classe multi-agents (director LangGraph porté) où l'utilisateur intervient (voix/texte), les agents réagissent en direct — l'andragogie (chantier 4) gouverne les interventions.
3. **Enregistrement + replay** : chaque live est enregistrable **comme un vrai webinaire**, rejoué sur plateforme ou app (PWA) — **JAMAIS de fichier téléchargeable**. Techniquement : flux d'événements horodatés (extension de `lib/playback/` porté), pas de capture vidéo.
4. **Identifiant indélébile** : tout support transmis porte, par utilisateur destinataire, un **watermark sonore ET visuel** (fondations OSS : audiowmark/videowmark, audioseal) — traçage des partages illicites. Traitement asynchrone (BullMQ), un artefact marqué PAR transmission.

## Parcours critique (écran par écran)

1. Formation `ready` → **la classe se lance automatiquement** : écran de casting (« votre équipe du jour » — prénoms, personnalités, visages) — 3 secondes de mise en scène, pas un formulaire.
2. **Live** : scène + agents qui parlent (TTS) + interventions utilisateur (texte, micro/ASR) + actions scéniques (spotlight, tableau) ; bouton « Enregistrer la session » visible et explicite.
3. **Fin de session** : récap (ce qui a été vu, quiz joués) → évaluation à chaud (handoff chantier 3) → « Revoir cette session » si enregistrée.
4. **Bibliothèque de replays** : mes sessions → lecture en streaming d'événements (jamais de bouton télécharger) — sur plateforme et PWA.
5. **Transmettre le support** : depuis un course/replay → génération asynchrone de l'artefact marqué (watermark sonore+visuel au nom du destinataire) → lien de consultation, pas de fichier.

## Ce que la v1 EXCLUT (les 3 refus)

1. **Pas de multi-apprenants simultanés dans une même classe live** — la classe v1 = un utilisateur + ses agents (le « mixte » désigne le casting d'agents). Le multi-humains est un chantier à part entière (présence, tours de parole) : parking lot avec condition de sortie.
2. **Pas de capture vidéo du live** — le replay est un flux d'événements rejoué (léger, conforme « jamais de fichier », re-rendu fidèle) ; une capture pixel serait téléchargeable par nature et lourde.
3. **Pas de watermarking synchrone** — jamais dans le chemin de lecture ; uniquement à la transmission, en job.

## Hypothèses restantes et leur test

| Hypothèse | Test | Critère de réfutation |
|---|---|---|
| Le flux d'événements suffit à un replay « comme un vrai webinaire » (audio inclus) | S2-005 : replay d'une session réelle avec audio des agents | Re-synthèse TTS au replay trop coûteuse/différente → persister les pistes audio générées (stockage vs calcul, ADR-203) |
| Les interventions UTILISATEUR sont capturables dans le flux (angle mort identifié au stress-test : `lib/playback/` ne rejoue que les actions générées) | S2-004 : événements user (texte + audio ASR) enregistrés et rejoués | Impossible sans refonte du moteur d'actions → ADR + re-scope avec Amine |
| audiowmark résiste aux ré-encodages réels de nos artefacts | S2-008 : marquer → ré-encoder mp3 128k → décoder l'ID | ID perdu → tester audioseal en second, sinon combiner |

## Traçabilité verdict

GO option C′ (np-cadrage §7). Niveau L99. Checkpoints humains : passe RTL des nouveaux écrans ; validation par Amine de la liste des cultures/prénoms (matière sensible — sa voix prime) ; DPIA AVANT build de l'enregistrement (07-legal).
