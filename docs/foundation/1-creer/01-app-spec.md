# 01 — App-spec · Chantier 1 — CRÉER

> **Fil conducteur** — Amont : 0-SOCLE (aucune story ne démarre avant S0-008 verte ; base v0.3.0 = MAIC Editor, Edit with AI et PBL v2 déjà natifs — gain direct de l'option C′, rien à porter). Aval : toute formation « prête » produite ici est l'INPUT du chantier 2-VIVRE (lancement live automatique) et du 3-ANCRER (matière des graines). Le moteur andragogique câblé ici est FOURNI par le chantier 4-MOTEUR.

## Ce qu'on construit

**Les trois portes d'entrée vers une formation** (vision, verbatim Amine) :

1. **Initier** — génération par la plateforme (pipeline existant porté : outline → scènes → classe), enrichie du câblage du moteur andragogique (les skill packs cessent d'être une vitrine : `getPromptOverride()` réellement appelé dans la génération).
2. **Consommer une formation déjà existante** — catalogue de formations prêtes, consultable et lançable.
3. **Initier depuis son propre contenu** — l'utilisateur dépose son contenu, qui doit respecter **un canevas/format à valider ensemble (Amine + Claude — jalon de co-validation, checkpoint S1-002)** avant toute implémentation du pipeline d'import.

Plus les **sorties** : capsules vidéo Hyperframes (pipeline Mishkāt), audio soigné (tachkil AR, garde-fou noise-floor), exports (PPTX natif ; **SCORM/cmi5 en export à deux couches** — package autonome + adaptateurs de tracking interchangeables ; statut option/cœur à la main d'Amine).

## Pour qui, pourquoi maintenant

Créateur de contenu (Amine et ses clients formateurs/institutions) : « devenir la nouvelle référence de la création de contenu ». Maintenant : la base v0.3.0 apporte l'édition de documents (MAIC Editor, Edit with AI) qui manquait — la fenêtre du quick-win est ouverte dès S0-008.

## Parcours critique (écran par écran)

1. **Accueil** → trois portes visibles : « Créer », « Catalogue », « Importer mon contenu ».
2. **Créer** : sujet/document → outline éditable (Editor natif v0.3.0) → génération scènes → formation prête → handoff chantier 2 (la classe se lance automatiquement).
3. **Catalogue** : liste des formations prêtes (les miennes + partagées) → fiche → « Rejoindre la classe ».
4. **Importer** : dépôt du contenu → validation contre le canevas (verdict clair : conforme / écarts listés) → mapping vers outline → même chemin que 2.
5. **Exporter** : depuis une formation prête → PPTX | package SCORM (deux couches) — jamais le live (chantier 2 : jamais de fichier téléchargeable pour le replay).

## Ce que la v1 EXCLUT (les 3 refus)

1. **Pas de marketplace/monétisation du catalogue** — catalogue interne d'abord (le business model est à la main d'Amine).
2. **Pas d'import « format libre »** — uniquement le canevas co-validé ; le tout-venant produirait des formations médiocres qui trahissent la promesse « supérieure aux attentes ».
3. **Pas de génération vidéo IA générative** — les capsules vidéo passent par Hyperframes (déterministe, souverain) ; pas de dépendance à un service vidéo externe.

## Hypothèses restantes et leur test

| Hypothèse | Test | Critère de réfutation |
|---|---|---|
| Le pipeline génération v0.3.0 accepte des prompt overrides par skill sans refonte | S1-001 : câblage `getPromptOverride()` sur UN point d'injection | Refonte du pipeline nécessaire → ADR + re-chiffrage avec Amine |
| Hyperframes s'intègre par appel de pipeline (brief→IR→frames) sans couplage de code | S1-005 : une capsule générée depuis une scène Qalem réelle | Couplage fort requis → interface de fichiers (brief JSON) en repli |
| scorm-again couvre le runtime des packages exportés (1.2 + 2004) | S1-007 : un export importé avec succès dans Moodle local | Échec d'import → tester EscolaLMS/Scorm-player, consigner en ADR |

## Traçabilité verdict

GO option C′ (np-cadrage §7). Niveau L99. Exécutant Ralph ; checkpoints humains : S1-002 (canevas, co-validation Amine+Claude), statut SCORM (tranche Amine, ADR-105).
