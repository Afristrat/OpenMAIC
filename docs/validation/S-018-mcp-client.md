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

Ces preuves ne sont ni une recette de fournisseur externe réel ni une validation navigateur d’une classroom de production. Le gate complet et la recette du déploiement restent à consigner avant clôture. Aucun connecteur de production n’est activé par ces tests.
