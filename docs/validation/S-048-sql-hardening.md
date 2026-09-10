# S-048 — Durcissement SQL avant publication, 10 septembre 2026

## Résultat vérifié

Les six constats du contrôle précédent sont corrigés dans la base isolée
`qalem_recipe`. Dernier `supabase db advisors --type security` :
`{"securityFindings":0}`. Ce résultat ne certifie pas la production.

La nouvelle migration `20260910063316_harden_usage_and_legacy_helpers.sql` a été
créée par `supabase migration new` après lecture de son aide, puis remplie dans
le dépôt. Elle corrige uniquement les trois objets qui n’avaient pas de migration
corrective en attente :

- `usage_summary` utilise les droits de l’appelant ; la vue et `usage_records`
  n’accordent plus aucun droit à PUBLIC, anon ou authenticated. L’accès serveur
  à l’agrégat est conservé. La révocation couvre aussi TRUNCATE, non protégé par RLS.
- `get_user_org_ids()` devient SECURITY INVOKER, avec chemin de recherche vide ;
  appel autorisé pour authenticated/service_role, retiré pour anon/PUBLIC.
  Son corps qualifie déjà explicitement ses objets et filtre sur `auth.uid()`.
  Aucune dépendance SQL n’a été trouvée dans `pg_depend` lors de l’inspection.
- `update_updated_at()` utilise uniquement `pg_catalog`, sans remplacer le
  déclencheur ; l’exécution publique directe est révoquée.

Les trois autres corrections existaient déjà et ont été réutilisées intégralement :
`20260909201746_widget_author_erasure.sql`,
`20260909202303_transmission_actor_erasure.sql`,
`20260909203617_course_author_erasure.sql`.
Les prérequis Diwan/source des recettes de reprise de formation ont aussi été
appliqués dans la base isolée : `20260909121728_diwan_source_references.sql` et
`20260909203142_organization_source_author_erasure.sql`.

## Preuves

`scripts/validation/s048-legacy-hardening.sql`, sous BEGIN/ROLLBACK :

- avant correction : exit 3, `Anonymous usage view exposure` ; la fuite est
  reproduite avec des lignes synthétiques, pas déduite du seul avertissement ;
- après correction : refus de lecture de la vue et de la table par anon,
  refus de la vue par authenticated, aucun privilège résiduel sur les deux objets ;
- utilisateur A puis B : seule son organisation est retournée ; aucune identité
  courante donne zéro organisation, jamais celles du précédent utilisateur ;
- le serveur lit toujours les sommes exactes 5 et 7 dans deux organisations ;
- un schéma contrôlé par l’appelant définissant son propre `now()` ne remplace
  pas l’horloge du déclencheur ; `updated_at` reste l’horodatage transactionnel ;
- vérification des propriétés SECURITY INVOKER et des droits de fonction.

Recettes existantes réexécutées avec succès sous ROLLBACK :
`s036-widget-author-erasure.sql`, `s036-transmission-erasure.sql`,
`s036-course-reclaim.sql`.

La recette `s048-director-integration.ts` passe ensuite par le vrai PostgREST :
collecte, correcteur natif, reçus, agrégats, cohortes et retrait. Le contrôle de
sécurité final, après tous les prérequis ci-dessus, retourne zéro constat.
Session 67005, exit 0 : TypeScript, lint et **3 252 tests sur 520 fichiers**.
Pas de nouveau build ni de suite navigateur complète dans ce lot SQL.

## État final

Suppression ciblée de la formation, du cours, de l’organisation et des trois
comptes de recette. Huit compteurs finaux nuls : utilisateurs, stages,
organisations, cours, consommation, reçus, discussions et tentatives quiz.
Conteneurs `qalem-prd3-db-20260910` et `qalem-prd3-rest-20260910` arrêtés ;
runner détaché du réseau interne. La base de recette demeure éphémère.

Production relue : `usage_summary` n’a toujours pas l’option corrective,
zéro compte portant les deux identifiants du test de durcissement.
**Aucune migration appliquée en production, aucun secret de production modifié.**

Prochain : recette complète Auth/Next/navigateur/DB, gate final et publication
coordonnée des migrations. S-048 reste ouverte. Le contrôle de sécurité sans
constat ne démontre pas l’absence de toute vulnérabilité ni un gain d’apprentissage.

Ponytail a évité de dupliquer les trois corrections existantes ; Supabase a conduit
à vérifier les droits de vue/table et à exécuter l’advisor réel. Référence :
[RLS et vues Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
Mnemo : identification en échec réseau ; ce document est la preuve versionnée.
