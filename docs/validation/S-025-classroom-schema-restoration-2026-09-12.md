# S-025 — Restauration de schéma révélée par la recette quiz

Date : 12 septembre 2026  
Environnement : Qalem production, PostgreSQL Qalem et web déployé  
Statut : correction d’exploitation appliquée ; S-025 reste `to_validate`.

## Constat

La recette authentifiée temporaire S-025 créait correctement une classroom, puis
sa lecture via `GET /api/classroom` échouait en HTTP 500. Le contrôle de la base,
sans lecture de données métier, a établi que
`public.shared_classrooms.authorization_verified` était absent. La requête REST
qui filtre ce champ répondait donc HTTP 400 ; la route classroom propageait cette
erreur en HTTP 500.

Ce n’était ni un cookie SSR invalide, ni une erreur d’autorisation : la session,
la relation de membership et le cookie étaient valides. Le défaut était une dérive
entre le code déployé et des migrations versionnées qui n’avaient jamais été
publiées.

## Correction contrôlée

Avant mutation, une sauvegarde persistante du schéma PostgreSQL a été créée ; sa
taille est de 763 574 octets et son SHA-256 est
`439a91754ce5079cd709b8715e1c1231fddb5507f7e885e0f0096da0bcc4537f`.

Les migrations suivantes ont été appliquées, dans cet ordre, sous un unique
`BEGIN`/`COMMIT` avec arrêt sur erreur :

1. `20260909224147_quiz_result_tenant.sql`
2. `20260909230843_shared_classroom_authority.sql`
3. `20260909231458_verified_share_read_access.sql`

Après transaction, la colonne, les deux triggers de partage, le trigger de
provenance quiz et la colonne `quiz_results.org_id` existent tous exactement une
fois. Les cinq partages publics historiques sont explicitement
`authorization_verified=false` : aucune publication historique n’a été déduite
d’une simple attribution.

Le contrôle REST du filtre et l’API classroom authentifiée répondent maintenant
HTTP 200. Les organisations et classrooms temporaires de recette ont été
recomptées à zéro après nettoyage.

## Limite restante

La recette navigateur n’a pas encore atteint la soumission du quiz : après la
réponse API 200, la page reste sur « Loading classroom... ». Elle ne prouve donc
ni l’extraction erreur/hésitation, ni l’idempotence, ni le rechargement de la
page de révision. Ces critères restent ouverts dans S-025.
