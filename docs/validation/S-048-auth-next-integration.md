# S-048 — Authentification réelle et routes Next.js

## Preuve du 10 septembre 2026

Source applicative : `be9222f4c0858a50123eb75a9ec752dc5b25b5fe`, complétée par `scripts/validation/s048-auth-next-integration.ts`. Exécution sur ServeurIA, dans le worktree isolé `/tmp/qalem-prd3-9c2043c.nDJBmn` du conteneur `qalem-refork-exec`.

La commande `pnpm exec tsx scripts/validation/s048-auth-next-integration.ts --isolated-s048` a terminé avec le code zéro (session 57427). Formatage distant, puis TypeScript et lint : code zéro (73236).

Le script crée deux comptes synthétiques par l’API administrative GoTrue, les connecte avec de vrais mots de passe aléatoires et récupère les cookies SSR produits par Supabase. Chromium headless utilise ces cookies pour appeler les vraies routes Next.js, sans interception réseau ni identité substituée dans `requireAuth`.

Résultats vérifiés :

- Rapport Director : 401 anonyme, 200 administrateur, 403 apprenant et organisation étrangère.
- Rapport vide identifié `qalem-director-v1`, sans cohorte inventée.
- Quiz natif : 200 authentifié, résultat zéro calculé depuis le contenu persisté, même reçu au rejeu HTTP.
- Relecture SQL via PostgREST : l’auteur de la tentative est exactement le compte connecté.
- Quiz : 403 pour un autre identifiant d’organisation et 401 sans cookies.
- Nettoyage du scénario réussi ; relecture indépendante : zéro utilisateur, session Auth, organisation, stage et tentative de quiz dans cette base.

## Infrastructure de recette

GoTrue `supabase/gotrue:v2.186.0`, version relue sur le conteneur Qalem de production, lancé séparément dans `qalem-prd3-auth-20260910`. Réseau interne `qalem-prd3-integration-20260910`, aucun port publié, limite mémoire 256 Mio et mémoire+swap 512 Mio, un CPU. PostgreSQL et PostgREST : voir la recette HTTP/SQL précédente.

Seules les 74 versions de `auth.schema_migrations` ont été copiées depuis la production : aucun utilisateur, mot de passe, jeton ou session. Le rôle de connexion Auth utilise le mot de passe aléatoire de la base de recette ; JWT partagé uniquement avec son PostgREST. Inscription publique désactivée, comptes créés confirmés par l’API administrative, aucun SMTP configuré. Santé Auth : HTTP 200.

Le script exige les endpoints exacts `S048_REST_URL=http://qalem-prd3-rest-20260910:3000` et `S048_AUTH_URL=http://qalem-prd3-auth-20260910:9999`, ainsi que le secret JWT éphémère dans `S048_JWT_SECRET`. Ne jamais utiliser les clés de production. Passerelle réelle loopback 3018 ; Next loopback 3020. Les réponses sont transmises, pas simulées. Le script arrête son groupe de processus Next et son navigateur dans `finally`.

## Limites et suite

- Next fonctionne ici en mode développement webpack, `NEXT_PUBLIC_E2E_TEST_MODE=false`. Ce n’est pas une recette du build de production ni de la page de connexion.
- Chromium parcourt les réponses HTTP et soumet le quiz par `fetch` ; il ne certifie pas l’interface complète de formation ou le rendu du rapport organisationnel.
- Le rapport testé est vide. Les reçus et agrégats non vides restent couverts séparément par `s048-director-integration.ts`, pas par cette nouvelle chaîne Auth.
- La base ne contient pas encore toutes les migrations PRD. La route `learning-observations` exige notamment la signature à six paramètres introduite par `20260909234228_shared_learning_scope.sql` et les observations scéniques de `20260910020547_learning_scene_observations.sql`, puis leurs évolutions ultérieures. Elles ne doivent pas être appliquées isolément en rétrogradant les versions ultérieures des fonctions d’export. Prochain travail : réconciliation et application ordonnée de l’ensemble candidat en recette, puis collecte → quiz → rapport non vide sous Auth réel.
- Les conteneurs sans volume sont **ÉPHÉMÈRES**. Les journaux Auth peuvent conserver des traces des comptes synthétiques ; aucune donnée réelle n’a été importée.
- Production inchangée ; aucune migration publiée, aucune collecte activée, aucun gain andragogique mesuré, aucune US fermée.

Skills Supabase et Ponytail : versions conservées, cookies et contrôles d’accès existants réemployés, aucune dépendance applicative ajoutée. Documentation consultée : [clients SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [configuration auto-hébergée](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml). Mnemo : identification en échec réseau, aucune persistance revendiquée.
