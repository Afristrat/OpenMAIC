# 04 — Feature backlog · Chantier 1 — CRÉER

> **Fil conducteur** — Démarre à S0-008 verte. S1-004 (catalogue) débloque la porte 2 côté chantier 2 (rejoindre une classe depuis le catalogue). S1-001 dépend de l'interface fournie par le chantier 4 (manifest/`getPromptOverride` existants suffisent pour câbler ; le contenu viendra du 4). Filtre Ponytail appliqué.

## v1 gelée (stories Ralph, critères binaires)

| ID | Story | Critère d'acceptation (binaire) |
|---|---|---|
| S1-001 | Câbler le moteur : `getPromptOverride()` appelé dans la génération | Un skill pack actif modifie de façon observable le prompt d'outline ET de scène (test unitaire sur le prompt assemblé) ; flag `skill_engine` |
| S1-002 | **[CHECKPOINT AMINE+CLAUDE]** Canevas d'import co-validé | Document `canevas-import-v1.md` : structure exigée, formats acceptés, règles de rejet — validé explicitement par les deux ; AUCUN code d'import avant |
| S1-003 | Table `courses` + `course_imports` + pipeline de validation du canevas | Migrations conformes au 02 ; dépôt d'un fichier conforme → `conform` ; non conforme → `rejected` + `validation_report` non vide (tests des deux chemins) |
| S1-004 | Catalogue interne (porte 2) | Page catalogue liste les `courses` `ready` + `catalog_visible` ; « Rejoindre » ouvre la classe ; e2e passe ; flag `course_catalog` |
| S1-005 | Import → outline (porte 3, aval du canevas) | Un contenu conforme produit une outline éditable dans l'Editor natif ; parcours e2e dépôt→outline→ready |
| S1-006 | Capsule vidéo Hyperframes depuis une scène | Une scène Qalem réelle → brief JSON → pipeline Hyperframes → mp4 relu dans l'app ; interface = fichiers (pas de couplage de code) ; flag `video_capsules` |
| S1-007 | Export SCORM couche 1 : package autonome | `export_jobs` format `scorm12` → zip avec `imsmanifest.xml` valide, importé avec succès dans un Moodle local (preuve : capture du cours importé + tracking completion) |
| S1-008 | Export couche 2 : adaptateurs interchangeables | Le MÊME contenu exporté en scorm12/scorm2004/cmi5 en changeant l'adaptateur seul (test : 3 packages, 1 générateur) ; statut produit (option/cœur) = tranche Amine consignée ADR-105 |
| S1-009 | Gate audio : tachkil AR + noise-floor | Pipeline TTS AR applique le tachkil avant synthèse ; toute piste < -50 dB de plancher de bruit rejetée avec erreur explicite (tests sur fixtures) |
| S1-010 | Export PPTX re-vérifié sur la nouvelle base | Export PPTX d'un course généré s'ouvre sans réparation dans PowerPoint (packages `mathml2omml`/`pptxgenjs` du monorepo opérationnels) |

## Parking lot (condition de sortie obligatoire)

| Item | Condition de sortie |
|---|---|
| Marketplace / monétisation catalogue | Décision business Amine — jamais à l'initiative de l'ingénierie |
| Import format libre (hors canevas) | Canevas v1 en usage réel + demande récurrente documentée |
| Émission xAPI temps réel vers LRS externe | Chantier 3 (évaluations) en aura l'usage — porté là-bas |
| Voix clonées / VoxCPM2 (upstream v0.2.1) | Provider AR tranché par Amine + exigence produit explicite |
| Références vocales anglaises Higgs par genre | Ajouter et valider au moins une référence anglaise féminine et une masculine ; la sélection par segment anglais doit préserver le genre de l’avatar, jamais remplacer silencieusement une enseignante par une voix masculine |
| Vidéo LTX-2 indisponible en production | Dette constatée le 2026-08-09 : Qalem cible `http://192.168.100.7:8189` avec `ltx-2-video`, mais la connexion est refusée et le proxy LiteLLM ne publie aucun modèle vidéo. Sortie de dette : service LTX-2 persistant et sain, modèle réellement exposé, appel depuis le worker Qalem concluant, génération d’une vidéo que Hyperframes ne peut pas produire, persistance dans une classroom puis contrôle visuel et export MP4 E2E. Tant que ces preuves manquent, la capacité vidéo LTX-2 est déclarée indisponible et ne doit pas faire échouer une génération sans vidéo. |
| Sources « tous azimuts » niveau Dīwān (RSS, multi-format exhaustif) | Canevas v1 stable ; chaque format supplémentaire = story dédiée avec cas client réel |
