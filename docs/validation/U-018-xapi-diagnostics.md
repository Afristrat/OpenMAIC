# U-018 — Diagnostic xAPI réel côté code

10 septembre 2026. Les routes auparavant absentes /api/xapi/status et /api/xapi/test sont implémentées. Accès requireSuperAdmin existant, origine POST contrôlée, configuration exclusivement serveur XAPI_ENDPOINT/XAPI_AUTH/XAPI_ENABLED. Aucune URL ni clé retournée ; configuration désactivée ou absente refuse le test en 409. HTTPS sans userinfo/query/hash, redirections refusées, délai natif cinq secondes et annulation requête, erreurs opaques 503. Aucun événement d’apprentissage envoyé.

Le GET natif /about vérifie réponse JSON et prise en charge de 1.0.3, version du client actuel. Il ne certifie ni écriture, ni autorisation des autres ressources, ni conformité intégrale. Cette ressource pouvant être publique, writeVerified=false reste explicite. Référence primaire consultée : [ADL, ressource About](https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-Communication.md#28-about-resource). Il ne s’agit pas d’une migration vers xAPI 2.0.

Widget : chargement/échec distincts de configuration absente, annulation au démontage, absence de faux succès HTTP, FR/AR/EN et RTL. Le diagnostic concerne la configuration globale du processus web, pas les configurations LRS par organisation utilisées par ANCRER ; périmètre annoncé dans l’écran. Aucun collecteur S-035 activé par ce lot.

92691 exit 0 : cinq tests API (rôle, origine, absence/désactivation, non-divulgation, URL invalide, succès natif, incompatibilité et panne), TypeScript 4 Gio et lint global. 74834 exit 0 : trois Chromium FR/AR/EN/RTL, absence, succès et 503. Réseau LRS et authentification simulés ; aucune connexion à un LRS réel certifiée. Runner sur base antérieure avec overlays, pas de build/gate complet au SHA propre ou déploiement. U-018 reste ouverte, dépendance S-035 et recette réelle à terminer.

25183 exit 0 : TypeScript 4 Gio et lint global recontrôlés après ajout de la recette navigateur. Mnemo identify_active_project : fetch failed ; aucune mémoire distante mise à jour.

Ponytail : configuration/Auth/fetch natifs réutilisés, aucune dépendance ni nouvelle table.

## 16 septembre 2026 — Diagnostic authentifié sur le LRS de production

Le SHA `2716df9` déployé configure le diagnostic global avec
`https://lrs.qalem.ma/xapi`, tandis que `XAPI_ENABLED=false` maintient toute
émission applicative suspendue. La recette versionnée
`scripts/proofs/u018-xapi-diagnostic.mjs`, exécutée depuis le conteneur de
validation ServeurIA, ouvre une session éphémère pour une super-administratrice
existante, injecte le cookie SSR réel puis vérifie `GET /api/xapi/status` et
`POST /api/xapi/test` sur `https://qalem.ma`.

Résultat observé : statut HTTP 200, `configured=true`,
`emissionEnabled=false`, puis diagnostic HTTP 200 avec
`connectionVerified=true` et `writeVerified=false`. Le test interroge
uniquement `xapi/about` : il ne crée aucun statement. La session de preuve est
révoquée et son jeton de rafraîchissement est refusé avant fermeture du
navigateur. Aucun secret, endpoint de configuration interne, tenant, collecte
ni émission xAPI n’est exposé ou activé.

## Clôture — 25 septembre 2026

La décision de conservation n’est plus ouverte :
`docs/decisions/2026-09-09-unblock-prd.md` conserve explicitement S-035 et
U-018 avec un statut/test administrateur sans identifiants LRS. S-035 est
désormais clôturée.

La recette authentifiée est rejouée contre `qalem.ma` et le LRS réel. Elle
retrouve `configured=true`, `emissionEnabled=false`,
`connectionVerified=true` et `writeVerified=false`, puis révoque la session de
preuve et refuse son jeton de rafraîchissement. Aucun statement n’est écrit.
Le SHA `554d70c1bf9bc6715be44ef50171a412c37bd64b` rend aussi le transport JSON de
la preuve robuste au BOM UTF-8 produit par PowerShell.

Les cinq tests API et les trois parcours Chromium FR/AR/EN, dont RTL, passent.
La gate complète du SHA fonctionnel déployé
`4a9dfb56652323d077c3477941e493f145449bb8` passe Prettier, TypeScript,
ESLint, 3 373 tests Vitest, le build de 127 routes et 196/196 Playwright.
Journal SHA-256 :
`8e8b70e1feeabd3770559bf9b5c34322f5339e9efdde4b172d52744a693e4bcb`.
Le déploiement Coolify `0ot3s8iu2crfnqmlz6elhmgd` est sain, sans redémarrage ni
OOM, et `/api/health` répond 200. U-018 est clôturée.
