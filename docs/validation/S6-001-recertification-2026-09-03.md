# S6-001 — Recertification globale du 3 septembre 2026

SHA fonctionnel testé : `8d359949492b6dfa44fbf3f92c82ec8312d250f8`  
SHA final déployé et distant : `d2797fbd2e1e50e0580595bd1879cce014816273`  
Écart entre les deux : documentation de certification et script de preuve S6-029 uniquement.

## Contrôle global sur ServeurIA

Toutes les commandes ont été exécutées dans le clone isolé `/tmp/qalem-s6-029-20260903`, avec l’image `qalem-validation:playwright-1.58.2-ffmpeg`.

| Contrôle | Commande | Résultat |
|---|---|---|
| Formatage | `pnpm check` | sortie 0, tous les fichiers conformes |
| Types | `npx tsc --noEmit --pretty false` | sortie 0, zéro erreur |
| Lint | `pnpm lint` | sortie 0, zéro erreur et zéro avertissement |
| Tests | `pnpm test` | sortie 0, 420/420 fichiers et 2 640/2 640 tests |
| Build | `NODE_OPTIONS=--max-old-space-size=8192 pnpm build` | sortie 0, 107 routes et assertion d’isolation des routes conforme |
| Navigateur | `pnpm test:e2e --workers=2` | sortie 0, 105/105 tests Chromium en 2,3 minutes |

La première invocation du build, sans plafond V8 explicite, a compilé puis échoué durant son typecheck interne à la limite de tas d’environ 2 Gio. Le conteneur disposait de 12 Gio et n’a pas été tué par le noyau. La relance à 8 Gio a réussi : il s’agit d’une configuration de processus de build, pas d’un OOM du service Qalem.

## Alignement des composants

Déploiements terminés :

- web : `yoxk9dw2s1doftqj2l3cr0cw` ;
- runtime workers : `obhun398kxwg55snr3d9mdh1`.

État vérifié après remplacement :

| Composant | Image | Mémoire / CPU | État |
|---|---|---|---|
| web | `bcx5pxyuc9z3lt4jtyjipcqu:d2797fbd…` | 1,5 Gio / 2 CPU | healthy, restart=0, OOM=false |
| worker principal | `a14gf0n3u719hnnd2yujrtmr_qalem-workers:d2797fbd…` | 3 Gio / 3 CPU | healthy, restart=0, OOM=false |
| capture-worker | `a14gf0n3u719hnnd2yujrtmr_capture-worker:d2797fbd…` | 1,5 Gio / 1,5 CPU | healthy, restart=0, OOM=false |

Le volume nommé `a14gf0n3u719hnnd2yujrtmr_capture-storage-states` est monté en lecture-écriture sur `/data/storage-states`. Les cinq derniers healthchecks des deux workers ont chacun un code de sortie nul.

## Parcours et persistance

- `/` : HTTP 200 ;
- `/api/health` : HTTP 200 ;
- `/api/server-providers` : HTTP 200 ;
- `/app` anonyme : HTTP 307 vers l’authentification ;
- `/api/profile` anonyme : HTTP 401.

La preuve de production S6-029, exécutée sur la même image web, ajoute une session authentifiée réelle, le catalogue publié HTTP 200, la génération tenant autorisée HTTP 200, le refus intertenant HTTP 403, le rechargement et le rendu interactif. Tous les comptes, organisations, invitations, templates, versions, publications, sessions et fichiers de preuve ont ensuite été contrôlés à zéro ou absents.

Enfin, `git rev-parse HEAD` et `git ls-remote origin refs/heads/refork-v030` ont retourné le même SHA `d2797fbd2e1e50e0580595bd1879cce014816273` avant la clôture. LiteLLM, hébergé sur Hostinger, n’a pas été touché par ces déploiements Qalem sur ServeurIA.
