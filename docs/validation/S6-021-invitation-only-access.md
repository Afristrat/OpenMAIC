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

## Recertification isolée du 16 septembre 2026

Le SHA `3061bc6` a été cloné dans un répertoire temporaire neuf du conteneur de
validation ServeurIA. Après une installation verrouillée, Playwright Chromium a
exécuté les deux scénarios permanents de `invitation-only-auth.spec.ts` :

1. sans invitation, la page n’expose que la connexion d’un compte existant ;
2. avec une invitation nominative, elle expose la création de compte.

Les deux scénarios réussissent en 9,4 secondes. Le clone, les dépendances et le
journal temporaires ont été supprimés après relevé du résultat. Cette preuve
valide la frontière UI au SHA courant, sans réémettre d’OTP ni envoyer de
courrier. Elle ne remplace pas la réception physique d’une invitation de tenant
par son destinataire, qui demeure la dernière preuve S6-021.

## Recette autonome de production du 24 septembre 2026

Le SHA `4cb3984b06a1e04c39eafeef2ab53760f382ad18` ajoute la recette permanente `scripts/validation/s6-021-production-invitation-recipe.mjs`. Elle utilise exclusivement une adresse officielle `delivered+…@resend.dev`, jamais Sophia ni un contact réel.

La recette de production confirme :

- `disable_signup=true` ;
- `/app` anonyme redirigé vers l’authentification ;
- inscription publique refusée en HTTP 422 avec `signup_disabled`, sans compte orphelin ;
- tenant et invitation administrateur créés, avec e-mail accepté par Resend ;
- adresse différente refusée en HTTP 403 sans création de compte ;
- inscription nominative réussie en HTTP 201 ;
- connexion par mot de passe et adhésion `admin` unique visibles ;
- rejeu du jeton refusé en HTTP 410 ;
- tenant, invitation, adhésion et identité de recette supprimés, compteurs résiduels à zéro.

La clé Resend Qalem est volontairement limitée à l’envoi : la lecture `GET /emails` répond HTTP 401. Ses droits ne sont pas élargis pour transformer une preuve fournisseur en preuve humaine.

## Gate fraîche du 25 septembre 2026

Aucun fichier fonctionnel du parcours d’invitation n’a changé entre la recette
`4cb3984b06a1e04c39eafeef2ab53760f382ad18` et le SHA déployé
`4a9dfb56652323d077c3477941e493f145449bb8`. La gate complète de ce dernier
passe Prettier, TypeScript, ESLint, 3 373 tests Vitest, le build de 127 routes
et 196/196 Playwright, dont les deux parcours `invitation-only-auth`. Journal
SHA-256 :
`8e8b70e1feeabd3770559bf9b5c34322f5339e9efdde4b172d52744a693e4bcb`.
Le déploiement est sain, sans redémarrage ni OOM. S6-021 reste ouverte
exclusivement pour la réception physique d’une invitation par son destinataire.
