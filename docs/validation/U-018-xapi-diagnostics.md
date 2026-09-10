# U-018 — Diagnostic xAPI réel côté code

10 septembre 2026. Les routes auparavant absentes /api/xapi/status et /api/xapi/test sont implémentées. Accès requireSuperAdmin existant, origine POST contrôlée, configuration exclusivement serveur XAPI_ENDPOINT/XAPI_AUTH/XAPI_ENABLED. Aucune URL ni clé retournée ; configuration désactivée ou absente refuse le test en 409. HTTPS sans userinfo/query/hash, redirections refusées, délai natif cinq secondes et annulation requête, erreurs opaques 503. Aucun événement d’apprentissage envoyé.

Le GET natif /about vérifie réponse JSON et prise en charge de 1.0.3, version du client actuel. Il ne certifie ni écriture, ni autorisation des autres ressources, ni conformité intégrale. Cette ressource pouvant être publique, writeVerified=false reste explicite. Référence primaire consultée : [ADL, ressource About](https://github.com/adlnet/xAPI-Spec/blob/master/xAPI-Communication.md#28-about-resource). Il ne s’agit pas d’une migration vers xAPI 2.0.

Widget : chargement/échec distincts de configuration absente, annulation au démontage, absence de faux succès HTTP, FR/AR/EN et RTL. Le diagnostic concerne la configuration globale du processus web, pas les configurations LRS par organisation utilisées par ANCRER ; périmètre annoncé dans l’écran. Aucun collecteur S-035 activé par ce lot.

92691 exit 0 : cinq tests API (rôle, origine, absence/désactivation, non-divulgation, URL invalide, succès natif, incompatibilité et panne), TypeScript 4 Gio et lint global. 74834 exit 0 : trois Chromium FR/AR/EN/RTL, absence, succès et 503. Réseau LRS et authentification simulés ; aucune connexion à un LRS réel certifiée. Runner sur base antérieure avec overlays, pas de build/gate complet au SHA propre ou déploiement. U-018 reste ouverte, dépendance S-035 et recette réelle à terminer.

25183 exit 0 : TypeScript 4 Gio et lint global recontrôlés après ajout de la recette navigateur. Mnemo identify_active_project : fetch failed ; aucune mémoire distante mise à jour.

Ponytail : configuration/Auth/fetch natifs réutilisés, aucune dépendance ni nouvelle table.
