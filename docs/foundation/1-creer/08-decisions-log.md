# 08 — Decisions log (ADR) · Chantier 1 — CRÉER

> **Fil conducteur** — ADR propres au chantier ; les transverses (C′, licence, flags…) vivent dans `0-socle/08-decisions-log.md`. Numérotation 1xx.

## ADR-101 — Export à deux couches : package autonome + adaptateurs de tracking (ACTÉE)

- **Quoi** : un générateur de package unique ; le standard de tracking (SCORM 1.2, SCORM 2004, cmi5/xAPI) est un adaptateur interchangeable.
- **Pourquoi** : SCORM 1.2 (2001) reste le format le plus accepté des LMS installés (~majorité du contenu mondial) ; SCORM 2004 est gelé depuis 2009 ; cmi5 est le remplaçant ADL à adoption lente — parier sur UN standard serait faux dans les deux sens ; l'architecture neutralise le pari. Format explicitement validé par Amine (2026-07-09 : « j'adore quand tu travailles exactement comme ça »).
- **Sources** : adlnet.gov (SCORM 2004 4th ed. 2009, statut cmi5) ; recherche 2026-07-09 consignée np-cadrage §3 (session 75931808).
- **Alternatives rejetées** : SCORM 1.2 seul (ferme cmi5/xAPI) ; cmi5 seul (adoption insuffisante des LMS cibles) ; double implémentation séparée (duplication).

## ADR-102 — Runtime SCORM : `scorm-again` en premier choix (ACTÉE, réversible S1-007)

- **Quoi** : runtime TS `jcputney/scorm-again` pour la couche d'exécution des packages.
- **Pourquoi** : TypeScript moderne, SCORM 1.2 + 2004 avec séquencement complet, iframes sandboxées, offline, LMS-agnostique, MIT — le seul candidat couvrant les deux versions dans notre langage.
- **Sources** : lecture du repo GitHub 2026-07-09 (README, licence) ; comparé à `EscolaLMS/Scorm-player`, `mlgarrido/node-scorm-player`, `gamestdio/scorm`.
- **Alternatives rejetées** : implémentation maison de l'API SCORM (réinventer une roue de 25 ans — interdit par la consigne d'Amine « check ce qui s'est déjà fait sur GH ») ; EscolaLMS en second si S1-007 échoue.

## ADR-103 — Vidéo : Hyperframes (déterministe, souverain), pas de génération vidéo IA (ACTÉE)

- **Quoi** : les capsules vidéo sortent du pipeline Hyperframes (Mishkāt : brief → IR → scènes HTML/GSAP → frames → mp4), intégré par interface de fichiers.
- **Pourquoi** : socle imposé par Amine (np-cadrage §1) ; déterminisme (re-render identique), souveraineté (local), habillage de marque contrôlé au pixel ; déjà prouvé au palier WALK côté Mishkāt.
- **Sources** : PASSATION mishkat (palier WALK ✅) ; verbatim Amine 2026-07-09.
- **Alternatives rejetées** : services vidéo IA externes (coût récurrent, non déterministe, fuite de contenu) ; couplage de code direct Qalem↔Mishkāt (deux sessions propriétaires — règle n°6).

## ADR-104 — Import : canevas co-validé AVANT pipeline, structure de données différée (ACTÉE)

- **Quoi** : la porte 3 n'accepte que des contenus conformes à un canevas co-validé Amine+Claude (S1-002) ; les colonnes de structure de `course_imports` seront affinées dans le commit de S1-003, après le canevas.
- **Pourquoi** : verbatim Amine (« son contenu qui doit respecter un canevas ou un format que l'on va valider tous les deux ») ; figer la structure avant le canevas inverserait la dépendance et produirait une migration jetable.
- **Alternatives rejetées** : import format libre (qualité de sortie non garantie — contredit « supérieure aux attentes ») ; structure devinée maintenant (hypothèse déguisée en schéma).

## ADR-105 — Statut produit de l'export SCORM : RÉSERVÉE (tranche Amine)

- **Quoi** : option ou cœur de l'offre — verbatim : « à ce stade maybe le scorm peut ne plus devenir une option ».
- **État** : l'ingénierie prépare les deux (S1-007/S1-008 identiques dans les deux cas) ; la tranche ne bloque aucune story de ce chantier. À consigner dès qu'Amine décide.
