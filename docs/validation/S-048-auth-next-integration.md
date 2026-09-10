# S-048 — Authentification réelle et routes Next.js

## Preuve du 10 septembre 2026

Source applicative du passage complet : `d7677eb54d3e3c6345d10f71321e036e6f92eeb5`, complétée par `scripts/validation/s048-auth-next-integration.ts`. Exécution sur ServeurIA, dans le worktree isolé `/tmp/qalem-prd3-9c2043c.nDJBmn` du conteneur `qalem-refork-exec`.

La commande `pnpm exec tsx scripts/validation/s048-auth-next-integration.ts --isolated-s048` a terminé avec le code zéro (session 62503, après intégration ordonnée des 38 candidates). Formatage distant, puis TypeScript et lint : code zéro (35758). Les sessions 57427 et 73236 couvraient uniquement le passage initial sans collecte ni rapport non vide.

Session 22220, code zéro : 520 fichiers et 3 252 tests unitaires réussis, build de production réussi, assertion d’isolation des routes standalone réussie. Sentry avertit de l’absence de jeton de release ; aucune publication Sentry revendiquée. Puis session 21413, code zéro : **même scénario complet avec `--standalone`**, sur `.next/standalone/server.js`, `NODE_ENV=production` et `NEXT_PUBLIC_E2E_TEST_MODE=false`.

Après ajout de l’option standalone au script : TypeScript et lint revérifiés, session 67604 code zéro. Neuf compteurs à nouveau nuls, aucun serveur Next restant ; Auth, REST et DB de recette arrêtés, runner détaché du réseau interne.

Le script crée deux comptes synthétiques par l’API administrative GoTrue, les connecte avec de vrais mots de passe aléatoires et récupère les cookies SSR produits par Supabase. Chromium headless utilise ces cookies pour appeler les vraies routes Next.js, sans interception réseau ni identité substituée dans `requireAuth`.

Résultats vérifiés :

- Rapport Director : 401 anonyme, 200 administrateur, 403 apprenant et organisation étrangère.
- Rapport vide identifié `qalem-director-v1`, sans cohorte inventée.
- Quiz natif : 200 authentifié, résultat zéro calculé depuis le contenu persisté, même reçu au rejeu HTTP.
- Relecture SQL via PostgREST : l’auteur de la tentative est exactement le compte connecté.
- Accord de collecte via la route authentifiée, enveloppe de discussion reçue par `learning-observations`, rejeu idempotent, puis quiz natif et rapport non vide : un participant, un quiz, un tour lié, score zéro.
- Retrait via HTTP : rapport vidé et collecte refusée ; réaccord : ancien epoch refusé, aucune résurrection. Le reçu fonctionnel du quiz reste disponible et identique.
- Quiz : 403 pour un autre identifiant d’organisation et 401 sans cookies.
- Nettoyage réussi ; relecture indépendante : neuf compteurs nuls — utilisateurs, sessions Auth, organisations, stages, cours, tentatives quiz, observations d’apprentissage, discussions et reçus Director.

## Infrastructure de recette

GoTrue `supabase/gotrue:v2.186.0`, version relue sur le conteneur Qalem de production, lancé séparément dans `qalem-prd3-auth-20260910`. Réseau interne `qalem-prd3-integration-20260910`, aucun port publié, limite mémoire 256 Mio et mémoire+swap 512 Mio, un CPU. PostgreSQL et PostgREST : voir la recette HTTP/SQL précédente.

Seules les 74 versions de `auth.schema_migrations` ont été copiées depuis la production : aucun utilisateur, mot de passe, jeton ou session. Le rôle de connexion Auth utilise le mot de passe aléatoire de la base de recette ; JWT partagé uniquement avec son PostgREST. Inscription publique désactivée, comptes créés confirmés par l’API administrative, aucun SMTP configuré. Santé Auth : HTTP 200.

Le script exige les endpoints exacts `S048_REST_URL=http://qalem-prd3-rest-20260910:3000` et `S048_AUTH_URL=http://qalem-prd3-auth-20260910:9999`, ainsi que le secret JWT éphémère dans `S048_JWT_SECRET`. Ne jamais utiliser les clés de production. Passerelle réelle loopback 3018 ; Next loopback 3020. Les réponses sont transmises, pas simulées. Le script arrête son groupe de processus Next et son navigateur dans `finally`.

## Limites et suite

- Le passage initial utilisait Next dev webpack ; le dernier passage utilise le build standalone de production. Ce n’est toujours pas une recette de la page de connexion : les cookies proviennent du SDK réellement connecté à GoTrue.
- Chromium parcourt les réponses HTTP et soumet le quiz par `fetch` ; il ne certifie pas l’interface complète de formation ou le rendu du rapport organisationnel.
- Le reçu de génération est une fixture insérée par les RPC serveur : aucun appel LLM ni parole réellement générée n’est certifié ici. En revanche, collecte, quiz, liaison, rapport, retrait et réaccord traversent les routes authentifiées réelles.
- Les 38 candidates de `20260909121728` à `20260910063316` ont été appliquées dans l’ordre sur une nouvelle copie de structure. Voir [l’intégration ordonnée](PRD-v3-ordered-migrations-2026-09-10.md). Cela ne certifie ni leur effet sur les données de production ni tous les parcours des autres US.
- Les conteneurs sans volume sont **ÉPHÉMÈRES**. Les journaux Auth peuvent conserver des traces des comptes synthétiques ; aucune donnée réelle n’a été importée.
- Production inchangée ; aucune migration publiée, aucune collecte activée, aucun gain andragogique mesuré, aucune US fermée.

Skills Supabase et Ponytail : versions conservées, cookies et contrôles d’accès existants réemployés, aucune dépendance applicative ajoutée. Documentation consultée : [clients SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [configuration auto-hébergée](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml). Mnemo : identification en échec réseau, aucune persistance revendiquée.
