# S6-029 — Consommation et export statique des widgets publiés

Date de certification : 3 septembre 2026  
SHA fonctionnel : `8d359949492b6dfa44fbf3f92c82ec8312d250f8`  
Déploiement Coolify : `j3uzw1ebax4s57ubhkgi44up`

## Résultat

Un auteur authentifié peut désormais choisir un widget publié dans le plan d’une formation. Qalem conserve les UUID exacts du template et de sa version ; la génération recharge uniquement cette version encore publiée, valide sa composition côté serveur et l’intègre à la scène sans appel LLM. Une publication ultérieure ne modifie donc pas une scène déjà matérialisée, qui contient sa composition validée et ses identifiants épinglés.

Le rendu client valide une seconde fois la composition persistée, puis interprète exclusivement l’AST déclaratif borné de S6-026. Aucun HTML fourni par le modèle, `eval`, iframe ou script n’est exécuté. Les champs numériques recalculent les valeurs, conditions, tableaux et graphiques autorisés. Le conteneur porte les attributs `lang` et `dir` de la composition.

Dans SCORM 1.2, SCORM 2004 et cmi5, la scène reste une représentation statique : image de scène et avis localisé. L’archive ne contient ni composition, ni identifiant de version, ni runtime interactif, ni code exécutable du widget.

## Preuves automatiques

- Catalogue authentifié : seules les versions publiées et valides sont exposées, sous forme de métadonnées sûres ; une composition persistée corrompue est filtrée.
- Chargement serveur : UUID valides, correspondance template/version, version courante publiée, `published_at` non nul et validation complète de la composition.
- Génération : version exacte intégrée sans appel LLM ; absence ou indisponibilité de la version échoue fermée.
- Autorisation : une consommation visant un tenant étranger s’arrête à HTTP 403 avant résolution du modèle.
- Navigateur : sélection de la version 7, persistance après rechargement et rendu interactif français, arabe RTL et anglais ; aucun iframe pour ce type de widget.
- Exports : les trois formats produisent le même contenu statique et excluent les marqueurs hostiles, l’AST et l’UUID de version.

Gate exécuté sur ServeurIA :

- Prettier : vert ;
- TypeScript : zéro erreur ;
- ESLint : zéro erreur et zéro avertissement ;
- Vitest : 420/420 fichiers, 2 640/2 640 tests ;
- build Next.js : 107 routes ;
- Playwright Chromium : 105/105 tests, avec deux workers, en 2,3 minutes.

Le premier build de validation a compilé puis atteint la limite interne V8 d’environ 2 Gio pendant le contrôle TypeScript. Le conteneur disposait de 12 Gio et n’a pas subi d’OOM noyau. La relance avec `NODE_OPTIONS=--max-old-space-size=8192` a terminé le build. Cet événement ne constitue donc pas un `OOMKilled` Qalem et ne contredit pas le diagnostic S6-002.

## Preuve réelle de production

Sur `https://qalem.ma`, un super-administrateur éphémère a créé et publié le template `36994dc9-4e29-4be0-8230-17bdc2723994`, version `52952599-11d6-43d1-ba4f-788cb80ac979`. Un administrateur du tenant A a ensuite :

- retrouvé cette version exacte dans le catalogue, HTTP 200 ;
- conservé sa sélection après rechargement du navigateur ;
- reçu HTTP 403 en tentant de la consommer pour le tenant B ;
- reçu HTTP 200 pour son propre tenant ;
- affiché le widget sans iframe et fait passer le résultat de 20 à 40 MAD en modifiant le prix de 100 à 200.

Le déploiement sert le SHA exact dans `bcx5pxyuc9z3lt4jtyjipcqu-174302462067`. Le conteneur est `healthy`, avec zéro redémarrage et `OOMKilled=false` ; `/api/health` répond HTTP 200.

## Nettoyage et incident de preuve

Les deux tenants, l’utilisateur Auth, les invitations, la session tenant, le template, sa version et sa publication ont été supprimés. La session super-administrateur éphémère a été révoquée par son UUID exact. Les contrôles finaux retournent zéro pour les templates `proof-s6-029-*`, organisations `Preuve S6-029 *`, utilisateurs `qalem-s6-029-*` et session ciblée. Les fichiers de session et de métadonnées sont absents de l’hôte et du conteneur.

Une première tentative a reçu de l’API un lien d’invitation basé sur l’origine interne Coolify et Playwright a inclus ce lien à usage unique dans son erreur de navigation. Le jeton a été considéré compromis sans délai ; ses deux organisations et le widget associé ont été supprimés avant toute réutilisation. Le parcours final consomme l’invitation côté API puis ouvre uniquement `/auth`, afin qu’aucun jeton ne puisse apparaître dans une erreur de navigation. Aucun secret durable n’a été exposé.
