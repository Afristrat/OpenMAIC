# 08 — Decisions log (ADR) · Chantier 1 — CRÉER

> **Fil conducteur** — ADR propres au chantier ; les transverses (C′, licence, flags…) vivent dans `0-socle/08-decisions-log.md`. Numérotation 1xx.

## ADR-101 — Export à deux couches : package autonome + adaptateurs de tracking (ACTÉE)

- **Quoi** : un générateur de package unique ; le standard de tracking (SCORM 1.2, SCORM 2004, cmi5/xAPI) est un adaptateur interchangeable.
- **Pourquoi** : SCORM 1.2 (2001) reste le format le plus accepté des LMS installés (~majorité du contenu mondial) ; SCORM 2004 est gelé depuis 2009 ; cmi5 est le remplaçant ADL à adoption lente — parier sur UN standard serait faux dans les deux sens ; l'architecture neutralise le pari. Format explicitement validé par Amine (2026-07-09 : « j'adore quand tu travailles exactement comme ça »).
- **Sources** : adlnet.gov (SCORM 2004 4th ed. 2009, statut cmi5) ; recherche 2026-07-09 consignée np-cadrage §3 (session 75931808).
- **Alternatives rejetées** : SCORM 1.2 seul (ferme cmi5/xAPI) ; cmi5 seul (adoption insuffisante des LMS cibles) ; double implémentation séparée (duplication).

## ADR-102 — Runtime SCORM : `scorm-again` en premier choix (SUPPLANTÉE PAR ADR-106)

- **Décision historique** : `jcputney/scorm-again` avait d'abord été retenu comme runtime embarqué.
- **Motif de la supersession** : `scorm-again` implémente le côté LMS de l'API. L'embarquer dans le SCO lui faisait créer sa propre API locale au lieu d'appeler celle du LMS hôte ; un statut pouvait alors sembler suivi sans quitter le package.
- **État effectif depuis ADR-106** : Qalem recherche l'API exposée par le LMS et appelle directement son contrat SCORM 1.2 ou SCORM 2004. La dépendance `scorm-again` et son runtime ont été supprimés du paquet et du graphe npm.
- **Notices** : aucune notice `scorm-again` n'est jointe au zip, puisqu'aucun code de cette dépendance n'y est distribué. Les notices générales du produit restent régies par ADR-002.

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

## ADR-106 — Adaptateurs natifs de suivi, pas d’API LMS simulée (ACTÉE)

- **Quoi** : le paquet Qalem rend le même contenu dans les trois formats. Seul l’adaptateur de suivi diffère : recherche de `API` et appels `LMSInitialize`/`LMSSetValue` pour SCORM 1.2 ; recherche de `API_1484_11` et appels `Initialize`/`SetValue` pour SCORM 2004 ; paramètres de lancement cmi5, récupération unique du jeton, lecture de `LMS.LaunchData`, puis statements xAPI `Initialized`, `Completed` et `Terminated` pour cmi5.
- **Pourquoi** : l’ancienne approche créait une API SCORM locale dans le SCO. Elle pouvait donner l’illusion d’un suivi sans l’émettre au LMS. Elle est supprimée avec la dépendance `scorm-again` : celle-ci est une bibliothèque de lecteur, non une API que le contenu doit s’auto-attribuer.
- **Limites vérifiées** : le paquet SCORM 2004 est conforme côté contenu, mais Moodle standard n’est pas un oracle de conformité SCORM 2004 complet ; son lecteur historique ne couvre pas tout le séquencement. La preuve SCORM 2004 doit donc passer par un lecteur compatible. cmi5 exige un LMS disposant d’un LRS et de son protocole de lancement : les paramètres et le jeton viennent du LMS, jamais de Qalem.
- **Sources** : [ADL, exigences SCORM 2004 4e édition](https://www.adlnet.gov/assets/uploads/SCORM_2004_4ED_v1_1_TR_20090814.pdf) ; [spécification cmi5 Quartz](https://github.com/AICC/CMI-5_Spec_Current/blob/master/cmi5_spec.md) ; [documentation Moodle App 5.0](https://docs.moodle.org/502/en/Moodle_app_SCORM_player).
- **Conséquence produit** : ADR-105 reste réservée. « Format générable » ne signifie pas encore « format commercialement promu » tant que les validations des lecteurs de référence ne sont pas enregistrées.
- **Preuve SCORM 1.2** : la recette S1-007 du 28 août 2026 déclenche le runtime depuis le navigateur Moodle, puis relit `completed` et le score `100` dans les API et tables du LMS ; voir `docs/validation/S1-007-scorm12-moodle-browser.md`.
