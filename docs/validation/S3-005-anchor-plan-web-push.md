# S3-005 — Plan d’ancrage opt-in et Web Push

## Verdict

S3-005 est certifiée le 6 septembre 2026 sur le code `f96bdc4c8d635e9855a9ef1600d9a5eaa5c095ad`. Le plan exige un opt-in explicite, crée un calendrier BullMQ borné à J+90, se suspend et se reprend en un clic, s’arrête avec suppression en cascade et résiste au rejeu d’une livraison déjà envoyée.

Cette certification couvre l’émission Web Push réelle par le worker vers une terminaison HTTPS externe. La réception sur appareils physiques iOS et Android, application fermée puis ouverture de la carte ciblée, reste exclusivement dans S3-002 et n’est pas revendiquée ici.

## Correctif de configuration persistant

La recette initiale a révélé que le frontal possédait la configuration VAPID, mais pas le worker Qalem. Les variables `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` et `WEB_PUSH_VAPID_SUBJECT` ont été ajoutées aux variables de production persistantes de l’application runtime Coolify, sans exposition de leur valeur, puis le runtime a été redéployé.

Le conteneur worker final `qalem-workers-a14gf0n3u719hnnd2yujrtmr-114746305764` exécute `f96bdc4c8d635e9855a9ef1600d9a5eaa5c095ad`, est `healthy`, compte zéro redémarrage et `OOMKilled=false`. Les contrôles de forme retournent respectivement 87 caractères, 43 caractères et un sujet `mailto:` ou HTTPS valide.

## Recette de production

Un compte invité temporaire, son organisation, un cours prêt, une session enregistrée terminée et douze graines ont été créés. Le flag `anchoring` n’a été activé que pendant la recette.

- L’appel authentifié d’opt-in a créé 14 livraisons.
- Les 14 échéances sont strictement croissantes.
- Les 14 clés de déduplication sont uniques.
- La dernière échéance est exactement bornée à J+90.
- Le bouton « Suspendre » a placé le plan en pause.
- Un job BullMQ témoin arrivé à échéance pendant la pause est resté `sent=false`, avec zéro tentative et zéro audit supplémentaire.
- Le bouton « Reprendre » a rejoué les livraisons non envoyées.
- Deux requêtes POST Web Push chiffrées de 359 et 365 octets ont atteint la terminaison HTTPS externe ; chacune comportait les en-têtes d’autorisation VAPID et d’encodage, et chacune a reçu HTTP 201.
- La livraison témoin est passée à `sent=true`, avec zéro erreur et zéro tentative échouée.
- Le rejeu explicite du même identifiant de livraison n’a produit aucun troisième POST et aucun audit supplémentaire.
- Le bouton « Arrêter définitivement » a supprimé le plan et toutes ses livraisons futures : compteurs finaux `plans=0`, `deliveries=0`.

La terminaison externe jetable a été créée et supprimée avec l’API officielle Webhook.site. Le premier essai de Quick Tunnel Cloudflare a été rejeté car le tunnel renvoyait 404 avant d’atteindre le récepteur ; cette tentative n’est pas utilisée comme preuve positive.

## Quality gate exact

Le gate a été exécuté sur ServeurIA dans un clone isolé au SHA exact. Le typecheck a nécessité `NODE_OPTIONS=--max-old-space-size=8192` : sans cette borne explicite, le processus de validation V8 atteignait sa limite par défaut de 2 Gio. Le worker de production n’a subi aucun OOM.

- Prettier : vert.
- TypeScript : zéro erreur.
- ESLint : zéro erreur.
- Vitest : 436 fichiers sur 436 et 2 686 tests sur 2 686.
- Build Next.js : 112 routes générées.
- Playwright : 111 tests sur 111, Chromium, un worker, `--retries=0`.

## Nettoyage et état final

Le flag `anchoring` est revenu à `false`. Le compte Auth répond 404 et les profils, cours, sessions, plans, abonnements, audits Web Push, stages et organisations de recette sont tous à zéro. L’URL Webhook.site a été supprimée avec HTTP 204. Les processus Cloudflare et récepteur locaux sont arrêtés ; leurs fichiers et les credentials temporaires ont été supprimés.
