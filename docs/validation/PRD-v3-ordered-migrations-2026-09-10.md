# PRD v3 — Intégration ordonnée des migrations

## Périmètre réellement vérifié

Le 10 septembre 2026, les **38 fichiers** du commit `d7677eb54d3e3c6345d10f71321e036e6f92eeb5`, de `20260909121728_diwan_source_references.sql` à `20260910063316_harden_usage_and_legacy_helpers.sql`, ont été exécutés par ordre lexicographique, sous un unique `BEGIN/COMMIT`, avec `ON_ERROR_STOP=1`.

Résultat : COMMIT réussi, sans correction ni suppression d’une migration pour faire passer la recette. La première tentative a échoué avant la première migration à cause de l’échappement d’un marqueur de journal ; la transaction a été annulée, puis le marqueur remplacé par un commentaire SQL.

Base neuve `qalem_recipe_ordered`, restaurée depuis l’archive **de structure uniquement** `/tmp/schema.dump` et sa table des matières `/tmp/schema.list` dans le conteneur `qalem-prd3-db-20260910`. Particularités GraphQL/Realtime déjà documentées dans [la recette initiale](S-048-real-http-integration.md). L’archive date du même jour ; ce n’est pas une copie des données existantes ni une preuve d’absence de dérive ultérieure en production.

Après succès, services Auth et REST toujours arrêtés : ancienne base renommée `qalem_recipe_partial`, nouvelle base renommée `qalem_recipe`. L’ancienne recette est conservée, pas effacée. Les 74 versions Auth ont été transférées depuis l’ancienne recette, sans compte ni session. Les services isolés ont ensuite été démarrés. La signature `record_consented_learning` a été relue : six paramètres.

## Validation applicative

Session 62503 : vraie connexion GoTrue, cookies SSR, Chromium headless, routes Next dev sans mode E2E, PostgREST et PostgreSQL. Collecte → discussion → quiz natif → rapport non vide, rejeu, retrait/réaccord, ancien epoch refusé, droits administrateur/apprenant/anonyme/hors organisation. Détails et limites dans [la preuve Auth](S-048-auth-next-integration.md).

Session 35758 : TypeScript et lint réussis. Advisor Supabase `db advisors --type security`, sur cette base avec `sslmode=disable` : tableau `results` vide, **zéro constat**. Ce verdict concerne le schéma de recette, pas les secrets, l’infrastructure ou les données de production.

Session 22220 : 3 252 tests/520 fichiers et build production réussis, routes standalone correctement isolées. Session 21413 : même chaîne Auth/collecte/quiz/rapport/retrait/refus exécutée avec succès sur le build standalone de production. La suite complète des scénarios UI Playwright n’a pas été rejouée dans ce lot.

Session 34676 : le parcours de rapport Director non intercepté a été ajouté à ce même scénario. Il exerce, avec l’utilisateur administrateur réellement connecté, la page `/org/[orgId]/reports`, les trois locales et RTL, l’ouverture puis l’actualisation du tableau. Ce n’est pas une validation humaine du design ni un remplacement de la suite E2E complète.

Après nettoyage : neuf compteurs à zéro dans `qalem_recipe` — utilisateurs, sessions Auth, organisations, stages, cours, tentatives quiz, observations d’apprentissage, discussions et reçus Director.

## Publication : ne pas confondre ordre validé et migration déployée

La lecture système de production ne trouve **aucune table `supabase_migrations.schema_migrations`**. Les seules tables de suivi trouvées appartiennent à Auth, Storage, Realtime et Supabase Functions. Ne pas lancer un `db push` en supposant un historique applicatif réconcilié.

Le point de départ utilisé ici est la copie de structure existante, pas un bootstrap intégral depuis la migration 00001. La réussite sur une base sans lignes métier ne démontre pas que les contraintes supplémentaires acceptent les données de production. Restent : précontrôles de données et de dérive en lecture, suivi de publication explicite, sauvegarde/restauration vérifiée, déploiement coordonné et critères UI/production des US. Aucune collecte réelle activée, aucune migration appliquée en production par cette recette.

Ressources éphémères sans volume ; l’ancienne base partielle est également conservée dans la couche Docker. Source et preuves doivent être poussées dans Git avant toute déclaration de persistance.
