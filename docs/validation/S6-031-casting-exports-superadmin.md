# S6-031 — Casting, exports et retour super-administrateur

Date de recette : 24 septembre 2026  
Tenant réel : Human Yo Impact  
Organisation : `aa7870b7-3938-4f24-b8bf-4a9d73565ba7`

## Contrat corrigé

- Le mode automatique utilise désormais le référentiel du tenant et restitue les dix mécanismes, sans compléter le casting depuis le catalogue global.
- Le mode manuel priorise les mécanismes choisis sans retirer les autres membres du référentiel. Les tests de sélection contrôlent dix identifiants de mécanisme uniques dans les deux modes.
- Les auto-présentations rapprochent le nom prononcé de l’identité canonique, y compris devant un point, une fin de phrase ou une conjonction.
- Les actions persistées comportent au moins une prise de parole pour chaque membre actif du casting complet.
- Une formation existante n’est pas migrée silencieusement. Les trois cours et trois classes de Human Yo Impact sont restés présents, sans création d’un quatrième cours.

## Recette Human Yo Impact

La recette authentifiée `scripts/validation/s6-031-production-casting-recipe.mjs` appelle réellement `/api/generate/agent-profiles` avec le contexte Human Yo Impact, puis relit les compteurs avant et après.

Résultat final :

- HTTP 200 ;
- 10 agents et 10 mécanismes uniques ;
- formatrice canonique : Hanae, genre féminin, avatar `/avatars/teacher-2.png`, fournisseur `higgs-tts`, voix `hanae` ;
- 3 cours avant et après ;
- 3 classes avant et après ;
- aucune formation existante réécrite ;
- persistance confirmée par un second passage sans option de configuration.

La recette a aussi chargé `/app?orgId=aa7870b7-3938-4f24-b8bf-4a9d73565ba7` dans Chromium avec la session super-administrateur. Au SHA fonctionnel déployé `bff9f1d6552fa2c7f5177e1910e834ce685cd016`, elle a observé la bannière « Mode test du tenant : Human Yo Impact », puis cliqué sur « Quitter le mode test et revenir à mon espace super-administrateur ». Le navigateur a atteint `/admin?tab=tenants`, la clé locale `qalem-current-org-id` a été supprimée et `isAdmin=true` est resté vrai. Aucun membership n’a été créé. Le SHA `5c90cfea0c35599f476ea05e020491a94ca508d3` ajoute la recette isolée permanente sans déclencher de génération ni consommer de modèle.

Cette première sortie restait cependant attachée au composant `/app` et au paramètre `?orgId=`. Une navigation vers le catalogue ou une classe conservait le tenant actif tout en faisant disparaître l’action de retour. Le SHA `590a223690d5166c2e6c7e1f365f4769b14bb5dc` remplace ce couplage par une session de test explicite au niveau du layout global. L’entrée depuis « Tester ce tenant » persiste l’identifiant dans la session de l’onglet ; le bandeau et sa sortie restent disponibles sur toutes les pages, y compris celles sans barre latérale. La sortie supprime à la fois la session de test et `qalem-current-org-id` avant de revenir à `/admin?tab=tenants`.

## Exports réels

La recette `scripts/validation/s6-031-production-exports-recipe.mjs` a utilisé la formation existante `GIWp6RedxM`, sans créer de cours.

PPTX :

- fichier `RSE appliquée au leasing marocain.pptx` téléchargé par le navigateur ;
- archive Office valide ;
- 11 diapositives ;
- 165 paragraphes ;
- accents Unicode présents ;
- aucun caractère de remplacement ou contrôle parasite détecté.

MP4 :

- job `5b761c3e-685c-4000-94ec-738ac7ef5059` ;
- état final `done` ;
- 17 scènes ;
- téléchargement `video/mp4` ;
- signature `ftyp` présente ;
- la reprise a réutilisé le même job au lieu d’en créer un second ;
- le lecteur de preuve annule le flux après le premier bloc et ne matérialise pas le fichier complet en mémoire.

## Validation technique

Avant la recette, le candidat fonctionnel a passé sur ServeurIA : Prettier, TypeScript, ESLint, 544 fichiers et 3 366 tests Vitest, le build de production et 195 scénarios Playwright. Les scénarios couvrent notamment le retour du mode tenant, les exports, le casting complet persistant et les auto-présentations.

La régression de sortie a été recettée au SHA `590a223690d5166c2e6c7e1f365f4769b14bb5dc` : Chromium entre dans le tenant, navigue vers `/catalog`, constate que le bandeau est toujours visible, revient à `/admin?tab=tenants` et relit les deux stockages vidés. La gate passe Prettier, TypeScript, ESLint, 544 fichiers et 3 366 tests Vitest, le build de production et ce parcours E2E ciblé. Le déploiement Coolify `7juhij3dllndapviymqvuhlt` est terminé ; le conteneur web sert exactement ce SHA, est `healthy`, sans redémarrage ni OOM, et `/api/health` répond HTTP 200.

## Recertification du workspace super-administrateur

Le 26 septembre 2026, la session réelle d’Amine a révélé que le retour vers
`/admin?tab=tenants` ne restaurait pas son propre workspace et qu’une navigation
interne pouvait conserver en mémoire les trois formations du tenant testé. Les
SHA successifs `81ce43183160fdd1c78e397663aaae1af8a1ac35`,
`51f5c125bdd84d503b374e6b494210f4c2bac45e` puis
`f896272b165ef531231dc6c7fd2b6f93dc107f27` corrigent la cause complète :

- l’API distingue une adhésion directe de l’accès global du superadministrateur ;
- le workspace direct est choisi par défaut à la place du tenant actif le plus récent ;
- l’organisation d’origine est enregistrée avant le changement de tenant ;
- une organisation simplement mémorisée ne devient plus un mode test implicite ;
- la sortie recharge intégralement le workspace d’origine afin de purger les données
  React du tenant testé.

La recette Chromium sur `qalem.ma` observe successivement :

1. Qalem Démo, identifiant `432f141e-f1d3-4ed9-bad3-6768100802a4`, avec 26
   formations et aucune bannière de test ;
2. Human Yo Impact, identifiant `aa7870b7-3938-4f24-b8bf-4a9d73565ba7`, avec
   3 formations et la bannière de test ;
3. après clic sur la sortie, Qalem Démo avec 26 formations, aucune bannière et
   le lien Administration toujours présent.

Les sept fichiers modifiés depuis `7acbd03e` ont des empreintes SHA-256
identiques dans le dépôt et l’arbre exécuté sur ServeurIA. La gate complète de
ce code passe Prettier, TypeScript, ESLint, 550 fichiers et 3 401 tests Vitest,
le build de 127 routes et 200/200 Playwright. Le déploiement Coolify
`vb3zo2b3s93ga4gfztec9kuu` sert l’image exacte
`f896272b165ef531231dc6c7fd2b6f93dc107f27` ; le conteneur est `healthy`,
`restart=0`, `OOMKilled=false` et `/api/health` répond HTTP 200.

## Recertification au SHA déployé du 26 septembre 2026

Les deux recettes permanentes sont rejouées contre la production servant
`0a15d648fcb20061ccfa79059d0d68cdec6e7bfb`, sans créer de quatrième
formation.

La génération isolée du casting répond HTTP 200 avec dix agents, dix mécanismes
et dix identités distinctes. La formatrice reste Hanae, femme, avatar
`/avatars/teacher-2.png`, fournisseur `higgs-tts`, voix `hanae`. Les compteurs
restent à trois cours et trois classes avant et après ; aucune formation
existante n'est modifiée. Dans Chromium, la bannière nomme Human Yo Impact, la
sortie atteint `/admin?tab=tenants`, efface le contexte tenant et conserve
`isAdmin=true`.

La formation réelle « RSE appliquée au leasing marocain » reste exportable. Le
PPTX téléchargé contient onze diapositives et 165 paragraphes, préserve les
accents Unicode et ne contient aucun contrôle parasite. Le job MP4
`5b761c3e-685c-4000-94ec-738ac7ef5059` est réutilisé sans nouveau rendu : état
`done`, dix-sept scènes, réponse HTTP 200 `video/mp4` et signature `ftyp`
présente.

Le gate du même SHA passe Prettier, TypeScript, ESLint, 3 402 tests Vitest, le
build Next.js et 200 scénarios Playwright. Le déploiement Coolify
`knjgq73sc0fl6yrdarsfsbg3` est terminé ; le conteneur
`bcx5pxyuc9z3lt4jtyjipcqu-014702271694` est sain, sans redémarrage ni OOM, et
`/api/health` répond HTTP 200.

## Recette intégrée par rôle au SHA déployé

Le parcours Human Yo Impact a ensuite été rejoué sur la même production avec
trois frontières d'autorisation distinctes, sans créer de cours ni lancer de
génération payante :

- le superadministrateur ouvre la classe réelle `GIWp6RedxM` sous la bannière
  Human Yo Impact et voit la première scène « Introduction et enjeux RSE pour le
  leasing » ; la recette de retour permanente reste celle décrite ci-dessus ;
- `info@humanyoimpact.com`, administrateur du tenant, reçoit HTTP 200, voit les
  dix-sept scènes et possède `canInteract=true`, `canEdit=true` et
  `canViewSources=true` ;
- un apprenant éphémère du tenant reçoit HTTP 200 et voit la même première scène,
  avec `canInteract=true`, `canEdit=false` et `canViewSources=false` ;
- ce même apprenant reçoit HTTP 403 sur la génération de profils d'agents et sur
  la demande du catalogue non publié ; aucun appel de modèle n'est donc lancé ;
- le compte et l'adhésion éphémères sont supprimés et la lecture filtrée finale
  retourne zéro adhésion résiduelle.

La formation utilisée est restée `ready` et non publiée dans le catalogue. La
recette prouve donc l'accès direct d'un membre autorisé sans lui divulguer le
catalogue privé ni lui accorder un droit d'auteur.
