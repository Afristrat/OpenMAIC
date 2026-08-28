# S1-012 — Preuve de persistance du worker de capture

Date : 2026-07-22  
Statut : partie infrastructure certifiée ; test visuel restant.

## Défaut constaté

Le code du worker résout une session Playwright par hôte sous
`/data/storage-states`, mais la définition effectivement déployée par Coolify
(`infra/coolify/qalem-runtime.yml`) ne déclarait ni ce répertoire ni un volume.
Une session enregistrée aurait donc disparu au prochain remplacement du
conteneur.

## Correction

Le runtime Coolify déclare désormais :

- `CAPTURE_STORAGE_STATE_DIR=/data/storage-states` ;
- le volume nommé `capture-storage-states` monté sur
  `/data/storage-states` en lecture-écriture.

La modification est portée par le commit `fe065b6`.

## Preuves système après déploiement

- Coolify a terminé le déploiement `dta4a440s1935v6knfk3m31i` sur le SHA
  `fe065b677a89a311e1d47392bc80792aaa696a5a`.
- Le worker porte l’image
  `a14gf0n3u719hnnd2yujrtmr_capture-worker:fe065b677a89a311e1d47392bc80792aaa696a5a`
  et son health check est `healthy`.
- `docker inspect` confirme le volume
  `a14gf0n3u719hnnd2yujrtmr_capture-storage-states` monté sur
  `/data/storage-states`.
- `https://qalem.ma/health` répond HTTP 200 après le déploiement.

## Ce qui reste volontairement ouvert

La session authentifiée de `proxy.ai-mpower.com` n’est pas encore déposée dans
ce volume. Le protocole S1-012 exige ensuite une vraie capture injectée dans
une scène puis validée visuellement. La story reste donc `passes: false`.

## Recertification du 28 août 2026

L’état live a été relu sur `serveuria-MS-7D98` :

- le conteneur `capture-worker` utilise l’image du SHA `f37767998c418ec4b5e3ad9cb385d946c2f47288`, est actif depuis dix heures et déclaré `healthy` ;
- `/health` retourne `ok=true`, `activeCaptures=0` et `maxConcurrency=1` ;
- le volume `a14gf0n3u719hnnd2yujrtmr_capture-storage-states` est monté en lecture-écriture sur `/data/storage-states` ;
- `/data/storage-states/proxy-ai-mpower-com.json` est absent.

Journal : `/tmp/qalem-s1012-live-infra-20260828.log`, SHA-256 `1800d2262f92331a33077fad196d7ecf80d85b8b55c105f1b6f33efdb6fb1522`.

Le package autonome présentait cinq avis dans ses dépendances de développement, dont un critique via Vitest 2.1.x. Le SHA `b6311f97f03716a8d39dd4e1c42da8be742da2d3` :

- aligne Vitest sur 4.1.11 ;
- ajoute un lockfile npm v3 ;
- remplace `npm install` par `npm ci` dans les deux étages Docker.

Au même SHA, `npm audit` retourne zéro vulnérabilité, le build TypeScript passe, les 20 tests du worker passent et l’image Docker construite répond à `/health`. Journal : `/tmp/qalem-s1012-worker-proof-b6311f9/worker.log`, SHA-256 `16c880315056fb34271e79c3690ecb50b173976f0754e35255fe2800910e1ae4`.

Le gate monorepo passe également : Prettier, TypeScript, lint, 385 fichiers et 2 505 tests Vitest, build de 100 pages et 83 tests Playwright. Journal : `/tmp/qalem-s1012-full-gate-b6311f9.log`, SHA-256 `e9e8fed0d37268d2bb1ec7b360bb74b0330db585698c541418af0a483a02968b`.

Le SHA `8cd328868759a78a4695f2bdd7e6267c563d6cee` ajoute le scénario permanent `e2e/tests/web-capture-failure-isolation.spec.ts`. Il vérifie dans le navigateur qu’un job encore `running` à 72 % ne déclenche pas de faux échec, puis que la génération terminée ouvre le cours. Le test serveur `tests/server/classroom-generation-capture.test.ts` prouve séparément que la panne réelle du worker est absorbée en `null` et que la scène persiste sans `assignedImages`. Ce découpage exerce chaque frontière sans simuler un succès de capture.

Validation ciblée : 15/15 tests Vitest et 1/1 test Playwright. Le gate complet du même SHA passe Prettier, TypeScript, lint, 385 fichiers et 2 505 tests Vitest, build de 100 pages et 84 tests Playwright en 3,7 minutes. Journal : `/tmp/qalem-s1012-full-gate-8cd3288.log`, SHA-256 `3288b2193ea546797336ca11f80d1311bbe0e6aebc14360e309747a494831eba`.

La story n’est pas fermée : le `storageState` est absent et aucune régénération du cours `F6G9W_LPT8` ne peut être lancée sans décision explicite sur l’usage d’une capture réelle puis validation visuelle.
