# S6-016 — Cadrage du moteur de widgets déterministes

Date de décision : 2 septembre 2026  
Décideur : Amine Mansouri  
Verdict : cadrage confirmé explicitement dans la session propriétaire Qalem.

## Décisions conservées

1. **Public et gouvernance** — Qalem reste multi-tenant. Le super-administrateur gouverne le catalogue global ; les administrateurs tenant peuvent consommer les widgets publiés, mais ne peuvent ni créer ni publier leurs propres templates en v1.
2. **Builder** — le super-administrateur décrit le widget attendu en langage naturel. Le fournisseur LLM administré courant produit uniquement une composition déclarative validée ; aucun modèle historique ni endpoint obsolète n'est restauré ou codé en dur.
3. **Frontière du moteur** — une composition réutilise les briques atomiques déjà livrées par le moteur borné. Ajouter une nouvelle brique atomique reste un changement de code et un redéploiement ; composer et publier un template ne doit nécessiter ni code, ni redéploiement.
4. **Export** — l'expérience reste interactive sur Qalem. Les exports SCORM 1.2, SCORM 2004 et cmi5 embarquent une capture statique du widget, son contenu utile et les médias persistés, sans HTML ou JavaScript exécutable du widget.
5. **Périmètre v1** — aucun builder visuel par glisser-déposer et aucune nouvelle brique 3D ou vidéo interactive.
6. **Choix pédagogique** — aucune restriction « andragogie seule » n'est réintroduite. L'auteur choisit explicitement pédagogie, hybride ou andragogie conformément au moteur actuel.

## Confrontation Q1–Q4 au produit actuel

| Décision | Preuve actuelle | Écart restant |
|---|---|---|
| Q1 — super-administrateur global et tenants subordonnés | `lib/api/auth.ts` sépare `requireSuperAdmin` des rôles d'organisation ; le provisionnement tenant est certifié par S6-022. | Aucun écart de fondation. |
| Q2 — composition déclarative sans redéploiement | Dix plugins sont chargés depuis `plugins/scenes/` et huit utilisent déjà le moteur métier partagé borné. | Les manifests, schémas et rendus restent des fichiers déployés. Il manque le builder IA, la validation sémantique, la prévisualisation et la publication persistante en base. |
| Q3 — SCORM statique | `lib/export/scorm/build-scorm-package.ts` embarque une image par scène et `lib/export/scorm/scene-to-html.ts` exclut le HTML exécutable des widgets. | S6-015 doit prouver qu'un template publié suit ce même chemin de capture statique. |
| Q4 — parcours v1 | La bibliothèque de sources accepte PDF, PPTX, DOCX, TXT et Markdown ; la génération, les plugins et les exports existent. | Il manque la modification et la publication d'une composition depuis l'administration, puis sa consommation dans une formation sans redéploiement. |

## Livrable d'exécution retenu

S6-015 est scindée dans le PRD 3 en quatre US d'exécution bornées : S6-026 pour la grammaire et l'évaluateur, S6-027 pour la persistance et les droits, S6-028 pour le builder IA et la publication, puis S6-029 pour la consommation et l'export. Toute réponse contenant du code exécutable ou une brique inconnue est refusée fermée.

Cette décision n'autorise aucune écriture dans un autre projet et n'étend pas les privilèges des administrateurs tenant.
