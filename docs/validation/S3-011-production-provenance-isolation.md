# S3-011 — Provenance, isolation et retrait de source

Date : 15 septembre 2026  
Environnement : conteneur web public Qalem, `https://qalem.ma`  
Script : `scripts/proofs/s3-011-production.js` au SHA `62eedcb2066b07b7db8a1203214ff69fc0130441`.

## Parcours recetté

La recette crée trois comptes et deux tenants temporaires : deux apprenants
suivent une même formation dans le premier tenant, tandis que le troisième suit
une formation distincte dans le second. Chaque session enregistrée porte son
propre événement apprenant, sa propre graine avec provenance et son propre
rappel déjà envoyé.

Résultats observés :

| Contrôle | Résultat |
| --- | --- |
| Réponse de l’apprenant concerné | `201` |
| Seconde réponse au même rappel | `409` |
| Réponse par l’autre apprenant du même tenant | `404` |
| Réponse par l’apprenant de l’autre tenant | `404` |
| Graine reliée à l’événement de l’autre tenant | `400` |
| Retrait de la source de recette | `204` |

Les deux apprenants du premier tenant ont des identifiants d’événement distincts.
Après retrait de la source, la réflexion déjà résolue conserve uniquement son
lien vers l’événement de son apprenant ; aucun texte de source n’est restitué.
Les deux organisations temporaires et leurs données en cascade ont ensuite été
supprimées : `cleanupRows=[0,0]`.

## Limite restante

Cette preuve ferme le parcours fonctionnel de provenance, de non-fuite et de
retrait. S3-011 reste `to_validate` : la gate complète du PRD doit encore être
rejouée sur le SHA de clôture avant `passes=true`.
