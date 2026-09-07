# S-018 — Connecteurs MCP externes

## Périmètre codé au 7 septembre 2026

Le SHA `786f44746c9cbecbbfe04e83778f0fc287bd218b` raccorde les outils externes au Director, au générateur PBL v1, au planificateur PBL v2 agentique et au planificateur PBL v2 nominal. Ce dernier conserve une sortie JSON unique et permet au maximum cinq étapes de consultation lorsqu’il dispose d’outils autorisés. Sans outil externe, son comportement mono-appel reste inchangé.

L’organisation provient du contexte serveur d’authentification/facturation. Le runtime ne découvre aucun outil sans ce contexte ; le client vérifie aussi l’organisation au moment de l’exécution. Une configuration sans liste explicite d’UUID ne donne aucun accès.

## Configuration d’exploitation

- Le fichier `mcp-servers.yml`, s’il existe dans le répertoire de travail, est prioritaire sur `MCP_SERVERS` (tableau JSON).
- Dans les conteneurs, monter le fichier en lecture seule à `/app/mcp-servers.yml`, sur le web et le worker concernés, ou utiliser la variable JSON sans fichier YAML.
- Les clés passent uniquement par `MCP_<IDENTIFIANT_MAJUSCULE>_API_KEY`, les tirets étant remplacés par des underscores. Les clés écrites directement dans le YAML/JSON ne sont pas utilisées.
- Redémarrer les processus concernés après un changement de configuration ; l’initialisation est paresseuse et partagée par les consommateurs d’un même module runtime.
- `GET /api/admin/mcp` exige un super-administrateur authentifié. Cette route sonde les connexions du processus web, sans cache ; elle ne certifie pas l’état d’un worker distinct. Elle ne renvoie ni clé ni URL.
- Un serveur en erreur est reconnecté avec redécouverte de ses outils lors de la sonde. Un appel métier échoué n’est jamais rejoué automatiquement.

## Preuves ciblées

Sur ServeurIA, conteneur `qalem-refork-exec`, clone isolé `/workspace/.codex-gate-s3-008-fe6ebba`, le SHA ci-dessus passe 35 tests répartis dans sept fichiers : MCP, planificateur PBL nominal et routage PBL. Le format des fichiers touchés, TypeScript et le lint passent également.

Le test HTTP utilise le véritable SDK MCP et un serveur de protocole contrôlé. Il prouve appel autorisé, refus inter-tenant sans appel réseau, réponse invalide, expiration d’un outil silencieux, santé en erreur puis reconnexion. Il traverse aussi l’adaptateur LangGraph et la boucle AI SDK, avec un modèle scripté. Le test du planificateur nominal prouve consultation puis hydratation du projet JSON ; son outil et son modèle sont contrôlés.

Ces preuves ne sont ni une recette de fournisseur externe réel ni une validation navigateur d’une classroom de production. Aucun connecteur de production n’est activé par ces tests.

## Gate global et déploiement en cours

Le gate corrigé au SHA `786f44746c9cbecbbfe04e83778f0fc287bd218b` est terminé : format global, TypeScript et lint passent ; 446 fichiers / 2 713 tests Vitest passent ; build de 113 pages ; 112 tests Playwright passent sans retry en 3,2 minutes. Le build E2E désactive la sortie standalone : son contrôle d’isolation a donc été explicitement sauté, et ne doit pas être présenté comme une preuve Docker.

Journal ServeurIA : `/tmp/qalem-s018-full-corrected-786f447.log`, SHA-256 `e810112ef9edfd58eaede3dd2fe236dbf35b77e7086987a3bcec4e96bd33429c`. La connexion SSH de suivi a été coupée, mais le PID Playwright `116513` a été retrouvé vivant ; aucun redémarrage du gate n’a eu lieu. Le journal final rapporte ensuite les 112 succès et le processus a disparu.

Déploiement web Coolify `cfytkra9vx7g077a15jy2ek8`, application Qalem `bcx5pxyuc9z3lt4jtyjipcqu`, lancé le 7 septembre 2026 à 14 h 46 UTC. La cible est `555d8b9f92a1e347fc4c0df1d9152fb898dba0aa` ; la comparaison avec le SHA validé ne trouve que les deux registres Ralph et ce document. Au dernier contrôle, le déploiement est `in_progress` : aucune livraison en production n’est encore certifiée.

Images de référence relevées avant déploiement : web `88e499b09bf35ac9bcbacfea7bddcd3d6a74ad72`, worker `6f13b77167f6f589c1bc938f32a6439879a0e9bc`, tous deux healthy.

### Bascule web vérifiée

Le déploiement web est confirmé `finished` à 14 h 51 UTC. Le conteneur `bcx5pxyuc9z3lt4jtyjipcqu-144633420992` sert l’image `555d8b9f92a1e347fc4c0df1d9152fb898dba0aa`, est healthy, avec zéro redémarrage et `OOMKilled=false`. Il a démarré à 14:50:26 UTC. La santé publique répond 200 ; la route `/api/admin/mcp` répond 401 sans authentification, contre 404 avant cette publication. Cette vérification prouve le déploiement de la route et son refus anonyme, pas son parcours authentifié.

Le déploiement runtime `trobepn3twhqylemt27pbz7q` a été lancé seulement après la fin du web pour éviter deux builds simultanés. Son verdict reste à relever, ainsi que la recette authentifiée et le suivi après déploiement ; S-018 demeure ouverte.
