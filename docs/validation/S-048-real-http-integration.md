# S-048 — Intégration réelle HTTP / SQL, 10 septembre 2026

## Résultat

Recette exécutée depuis le worktree serveur au socle `826d91c`, avec le nouveau
script `scripts/validation/s048-director-integration.ts`. Aucun module applicatif
simulé : client Supabase, contexte de requête, reçus Director, collecte,
correcteur natif, lecteur de patterns, choix observé et validation du rapport.

Dernier passage : sortie `S048 real HTTP/SQL: zero/one observation, zero score,
receipt/quiz/report, cohorts, rights and withdrawal passed`, exit 0.
Session 4243, exit 0 : format du script, TypeScript et lint complets.

Le script vérifie :

- zéro observation : aucun pattern, repli explicite ;
- reçu serveur confirmé, sélection et génération puis discussion réellement écrite ;
- quiz natif corrigé par `submitClassroomQuiz` depuis le contenu persisté : absence
  de réponse donnant zéro, puis même reçu à la reprise de la soumission ;
- une seule observation suffisante, score zéro conservé ;
- suggestion limitée aux agents disponibles et groupe classique distinct ;
- rapport : un participant, un quiz, un tour lié, score zéro, pas de différence
  inventée en l’absence d’un groupe comparable ;
- HTTP 403 pour un JWT `authenticated` tentant d’appeler la RPC privilégiée ;
- retrait : disparition du pattern et du rapport, refus d’un nouveau reçu ;
- nouveau passage après réaccord sans résurrection des anciennes observations.

Le premier passage utilisait une note injectée dans la RPC de résultat ; il a été
remplacé par le correcteur applicatif réel. Un dernier passage vérifie aussi la
version finale de la passerelle HTTP, à destination Docker fixe.

## Isolation

Source lue uniquement : `supabase-db-lkqqmwsn5zydykuv3gd6q7ws`, PostgreSQL 15.8.
Base jetable : `qalem_recipe` dans `qalem-prd3-db-20260910`, même image
`supabase/postgres:15.8.1.085`, mémoire 1 Gio / mémoire + swap 2 Gio, un CPU.
API : `qalem-prd3-rest-20260910`, `postgrest/postgrest:v14.12`, 256 Mio /
512 Mio, un CPU, pool de trois connexions. Aucun port publié.
Réseau Docker interne : `qalem-prd3-integration-20260910`.

La copie `pg_dump --schema-only --format=custom --no-publications
--no-subscriptions` ne contient aucune ligne métier. `_realtime` et `realtime`
sont exclus. Droits et propriétaires applicatifs restaurés avec `supabase_admin`.
Les rôles auxiliaires manquants ont été créés **sans connexion** dans la recette
uniquement. Aucun mot de passe de production n’a été copié.

Particularités de restauration identifiées : `--clean --if-exists` échoue sur les
politiques dont le schéma n’existe pas encore ; restauration dans une nouvelle
base conservant son schéma public. Le filtrage positif par schéma omettait les
extensions nécessaires ; retour à l’archive complète avec exclusions Realtime.
L’entrée de table des matières `ACL graphql_public FUNCTION graphql(...)` doit
être retirée : ce droit hérité référence une fonction absente de l’extension
installée. Aucun droit applicatif n’a été supprimé pour obtenir un succès.
Ce n’est pas une validation de GraphQL ou Realtime.

La passerelle locale du script ne fait que retirer `/rest/v1` et transmettre
requêtes/réponses au vrai PostgREST. Les JWT sont temporaires, signés pour cette
API isolée ; aucun secret n’est imprimé. L’identité applicative est fournie au
contexte serveur de recette, pas vérifiée par un parcours de connexion GoTrue.

## Migrations et reprise

Neuf fichiers appliqués ensemble sous BEGIN/COMMIT dans la base jetable :

1. `20260909185224_consented_learning_collection.sql`
2. `20260909224147_quiz_result_tenant.sql`
3. `20260909230843_shared_classroom_authority.sql`
4. `20260909231458_verified_share_read_access.sql`
5. `20260910033146_consented_discussion_collection.sql`
6. `20260910035605_classroom_quiz_attempts.sql`
7. `20260910042141_discussion_quiz_linkage.sql`
8. `20260910045739_director_experiment_receipts.sql`
9. `20260910051111_director_experiment_outcomes.sql`

La recette `s048-director-outcomes.sql` passe ensuite sous BEGIN/ROLLBACK.
Pour le passage HTTP, seuls ses INSERT initiaux, précédant `SET LOCAL ROLE`,
sont rejoués et validés dans la base jetable. Ils créent les trois identités
synthétiques terminant par 31/32/33 et la formation `s048-receipt-proof`.

Exécution depuis le worktree serveur :
`pnpm exec tsx scripts/validation/s048-director-integration.ts --isolated-s048`.
Variables : `S048_REST_URL=http://qalem-prd3-rest-20260910:3000` et
`S048_JWT_SECRET`, repris **sans impression** depuis le conteneur PostgREST
de recette uniquement. L’authenticator isolé doit avoir le mot de passe temporaire
configuré dans son URI, pas le mot de passe initial implicite de l’image.

## Contrôle de sécurité : non soldé

CLI `supabase db advisors --help` consultée, puis exécution `--type security`
sur l’URI de la base jetable avec `sslmode=disable` (réseau Docker interne).
Le premier essai sans cette option échouait faute de TLS dans ce conteneur.
Le passage corrigé aboutit et retourne six constats sur le schéma restauré :

| Niveau | Objet | Constat |
|---|---|---|
| ERROR | `public.usage_summary` | Vue à privilèges du propriétaire |
| WARN | `public.assert_course_tenant_integrity` | search_path mutable |
| WARN | `public.assert_transmission_tenant_membership` | search_path mutable |
| WARN | `public.get_user_org_ids` | search_path mutable |
| WARN | `public.update_updated_at` | search_path mutable |
| WARN | `public.prevent_widget_template_version_mutation` | search_path mutable |

Aucun de ces objets n’est créé par les neuf migrations ci-dessus. Ils restent
à analyser et corriger avant une certification globale ; leur antériorité ne
justifie pas de les ignorer. Cette recette ne prouve pas leur exploitabilité.
Références consultées : [sécurisation de l’API Supabase](https://supabase.com/docs/guides/api/securing-your-api),
[configuration PostgREST](https://docs.postgrest.org/en/v14/references/configuration.html).

## État final et limites

Suppression ciblée des fixtures : formation, organisation, trois comptes.
SQL final : **0 utilisateur, 0 formation, 0 organisation, 0 reçu Director,
0 discussion, 0 tentative quiz**. Les deux conteneurs sont arrêtés ; le runner
est détaché du réseau de recette. Leur contenu reste **éphémère** dans leur couche
Docker, sans volume persistant dédié. Journaux et archive sous `/tmp` éphémères.
Relecture production : table candidate `director_receipts` absente et zéro compte
portant les identifiants de recette. Aucune collecte activée ni migration publiée.

Restent : correction des constats de sécurité, chaîne complète navigateur / Auth /
routes Next.js / DB, ensemble des migrations PRD et gate final au SHA poussé,
puis publication contrôlée. Ce passage ne mesure aucun gain d’apprentissage.
S-048 et l’objectif global restent ouverts. Mnemo : identification en échec réseau.
Ponytail/Supabase ont conduit au réemploi des modules réels et à l’isolation de la
recette ; aucune dépendance applicative ou permission de production ajoutée.
