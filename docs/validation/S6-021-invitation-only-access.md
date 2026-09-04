# S6-021 — Accès sur invitation uniquement

## Recertification du 2026-09-04

Une relecture directe de `/auth/v1/settings` après le déploiement du PRD a révélé une régression de configuration : `disable_signup=false`. La variable persistante Coolify `DISABLE_SIGNUP` a été rétablie à `true`, puis la stack Supabase Qalem a été recréée.

La preuve après recréation est convergente : le conteneur Auth expose `GOTRUE_DISABLE_SIGNUP=true`, l’endpoint public expose `disable_signup=true`, une tentative d’inscription réelle répond HTTP 422 avec `signup_disabled`, et aucun compte portant le marqueur de recette n’a été créé. Auth, DB, Storage et Kong sont healthy, sans redémarrage ni OOM. La route `/auth` répond 200 et l’accès anonyme à `/app` répond 307 vers `/auth?next=/app`.

## Verdict

L’accès public est fermé au SHA `d9d869c4810604763ce5b9ca1f1d4559433914de`. Un visiteur peut uniquement se connecter avec un compte existant. La création d’un compte exige une invitation nominative valide et produit l’adhésion au tenant dans la transaction d’insertion de l’identité.

## Protection persistante

- La configuration persistante de GoTrue contient `disable_signup=true` et la valeur effective du runtime a été relue après déploiement.
- `GET /auth/v1/settings` répond 200 et annonce l’inscription désactivée.
- `POST /auth/v1/signup` répond 422 avec `error_code=signup_disabled`.
- Les migrations `00047_invitation_only_signup.sql` et `00048_invitation_token_insert_metadata.sql` sont appliquées à la base Qalem.

Le jeton d’invitation est porté dans les métadonnées utilisateur disponibles lors de l’`INSERT` initial dans `auth.users`. Le trigger vérifie sous verrou le jeton, l’adresse exacte, l’expiration et l’absence de consommation antérieure, puis crée l’adhésion et consomme l’invitation dans la même transaction.

## Production

- Déploiement : `nd1cgx3w1uvb6hgcomknkety`, terminé sur le SHA exact.
- Conteneur : `bcx5pxyuc9z3lt4jtyjipcqu-121408921150`, sain, image taguée avec le SHA exact.
- Routes directes : `/` = 200, `/auth` = 200, `/app` = 307 vers `/auth?next=/app`.
- Navigateur : un seul onglet de connexion sans invitation, aucun bouton Google/GitHub, aucun mode invité ; l’accès anonyme à `/app` aboutit à la page de connexion.

La recette réelle a créé un propriétaire temporaire, une organisation, une adhésion administrateur et une invitation nominative `manager`. L’inscription a répondu 201, la connexion 200, l’adhésion `manager` était présente et l’invitation consommée. L’organisation et les deux identités temporaires ont ensuite été supprimées ; le contrôle final ne trouve aucun résidu.

## Gate complet

Exécuté sur ServeurIA au SHA exact :

- formatage, TypeScript et lint : verts ;
- Vitest : 388 fichiers, 2 514 tests réussis ;
- build : vert, avec assertion permanente de l’isolation des routes standalone ;
- Playwright : 86 tests réussis en 4,4 minutes.

Journal : `/tmp/qalem-gate-logs/s6021-d9d869c-full-gate.log`  
SHA-256 : `cb88aafb210470d7e98f0df8f8b607c0fd4e34149a5e0eabe4245cc673a0d539`
