# S6-002 — Diagnostic mémoire propre à Qalem

## Verdict

Le diagnostic du 2 septembre 2026 ne montre aucun OOM imputable aux conteneurs Qalem de production. Les OOM visibles dans le journal noyau appartiennent à deux cgroups externes. Les limites Qalem sont persistantes après recréation, les trois conteneurs sont sains et un scénario borné couvrant génération et exports réussit sans OOM ni swap.

Aucune modification du swap global, d’un autre projet ou du code Qalem n’est nécessaire. L’isolation déjà en place entre web, worker lourd et capture Chromium est en revanche une contrainte d’architecture à conserver.

## Corrélation des OOM historiques

La source primaire est `journalctl -k` sur ServeurIA, du 20 août au 2 septembre 2026.

### Supabase externe

Les OOM des 26 août, 30 août, 31 août et 1er septembre ciblent tous le cgroup Docker exact :

`3d8d363f5d0ade8ea7a0911dff21996dfcfc1f183906411708e870828b64b94c`

Docker l’identifie comme `supabase-edge-functions-r11yqnmzzgv5qn8138xddwzt`, image `supabase/edge-runtime:v1.71.2`. Ce conteneur n’appartient pas à la stack Qalem `lkqqmwsn5zydykuv3gd6q7ws`.

### Cgroup Python externe

L’OOM du 26 août à 12:19:04 cible le cgroup exact :

`38fb235702def72928668d647a0802ee318081e1f0b5dce10130733a0280dc9f`

Le conteneur supprimé n’est plus inspectable directement. Le journal noyau conserve toutefois sa limite de 5 Gio et son arbre de processus : `npm run start`, backend/frontend concurrents, Vite preview, `uv`, Gunicorn, Python et esbuild. Cette signature correspond ligne pour ligne au service MiroShark actuel, lui aussi limité à 5 Gio. Elle ne correspond à aucun runner Qalem, dont les processus, images, limites et cgroups sont distincts. L’attribution à l’ancienne incarnation MiroShark repose donc sur cette signature système ; le fait essentiel certifié est que ce cgroup n’était pas Qalem.

## État Qalem après recréation du 2 septembre

Les conteneurs déployés au SHA `cd3109a9c2f1a64de8e99be6676fe7564163dac4` exposent :

| Composant | Limite mémoire | Swap maximal | CPU | Mémoire observée au repos | État |
|---|---:|---:|---:|---:|---|
| Web | 1,5 Gio | 3 Gio | 2 | 149,5 Mio | healthy, restart=0, OOM=false |
| Worker | 3 Gio | 6 Gio | 3 | 197,6 Mio | healthy, restart=0, OOM=false |
| Capture worker | 1,5 Gio | 3 Gio | 1,5 | 100,2 Mio | healthy, restart=0, OOM=false |

Ces valeurs proviennent de `docker inspect`, pas du manifeste seul. Elles correspondent à `infra/coolify/qalem-runtime.yml`, au plafond V8 du Dockerfile et à `WORKER_HEAVY_CONCURRENCY=1`. Le build Next est borné à deux workers par `experimental.cpus=2`.

Le journal noyau ne contient aucun événement OOM depuis leur démarrage. Le déploiement web et runtime du jour s’est terminé sans OOM ; il constitue également la preuve de persistance après recréation.

## Scénario borné génération + exports

Un conteneur de validation distinct a été créé avec `--memory=4g --memory-swap=4g --cpus=2`. Il a exécuté les dix scénarios de :

- `e2e/tests/generation-flow.spec.ts` ;
- `e2e/tests/classroom-interaction.spec.ts`, y compris export MP4 et tous les formats téléchargeables.

Résultat : **10/10 réussis en 1,6 minute**, `exit=0`, `OOMKilled=false`, `RestartCount=0`, pic swap `0`.

L’échantillonnage cgroup sépare :

- pic mémoire anonyme : 4 080 427 008 octets ;
- pic cache/fichiers : 1 108 103 168 octets ;
- pic noyau : 87 724 032 octets ;
- pic global cgroup : 4 295 020 544 octets pour une limite de 4 294 967 296 octets, sans OOM.

Ce harnais additionne dans un seul cgroup le serveur Next, le navigateur Chromium et Playwright. La production ne doit donc pas recopier cette topologie : le navigateur de capture reste isolé du web et du worker lourd. Le harnais et son script ont été supprimés après vérification (`CLEANUP_OK`).

## Quality gate associé

Le code de production exact, inchangé pendant ce diagnostic, a été certifié le même jour : Prettier, TypeScript et ESLint verts ; 408/408 fichiers et 2 591/2 591 tests Vitest ; build 103/103 pages ; 89/89 tests Playwright.
