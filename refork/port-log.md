# Port log — S0-002 (OURS_ONLY → refork-v030)

Journal d'execution de `refork/port_ours_only.py`. Chaque execution reelle
(hors `--dry-run`) ajoute une section horodatee ci-dessous.

## Execution 2026-07-10T13:38:56

- Inventaire : `C:\projets\Qalem\refork\inventaire.json`
- Repo carriere (main) : `C:\projets\Qalem\OpenMAIC`
- Worktree cible : `C:\projets\Qalem\refork-v030-wt`
- Total OURS_ONLY attendu : 264
- Source `git show main:<path>` : 251
- Source repli filesystem (fichier non suivi sur main — gitignore/genere) : 13
  - Fichiers concernes par le repli filesystem (motif FR-1 : `git show` echoue car fichier absent de l'historique `main`, present seulement sur le disque du repo carriere) :
    - `.env.docker.example`
    - `docs/bundle-optimization-todo.md`
    - `docs/np-cadrage.md`
    - `docs/self-hosted.md`
    - `next-env.d.ts`
    - `supabase/.temp/cli-latest`
    - `supabase/.temp/gotrue-version`
    - `supabase/.temp/pooler-url`
    - `supabase/.temp/postgres-version`
    - `supabase/.temp/project-ref`
    - `supabase/.temp/rest-version`
    - `supabase/.temp/storage-migration`
    - `supabase/.temp/storage-version`
- Fichiers proteges (non ecrases, superset strict deja present dans le worktree) : 1
  - `.ralph/progress.md` : suivi actif du Ralph loop de re-fork (deja modifie par S0-001 dans ce worktree) ; le contenu main est un prefixe exact du contenu worktree (superset strict) -> ecraser detruirait l'entree Session Log S0-001
- Nouveaux fichiers ecrits : 262
- Fichiers mis a jour : 1
- Fichiers deja a jour (idempotence) : 0
- Erreurs : 0
- Verification post-copie : 264/264 conformes, ecarts = 0
- Hash sha256 de l'ensemble des 264 chemins (contenu concatene, ordre inventaire) : b8531895e4815528ad68ce9603e371f5a19667e7bb6bd0bb2a33f414472404b0

### Note sur le suivi git des 264 fichiers (analyse manuelle post-execution)

Les 264 fichiers sont tous presents et verifies octet-pour-octet sur le disque du
worktree (cf. verification ci-dessus). Cote suivi `git`, 18 d'entre eux ne seront
PAS inclus par un `git add -A`/`git add .` standard (git les ignore silencieusement) :

- **13 fichiers** non suivis sur `main` non plus (repli filesystem, cf. section
  ci-dessus) : `.env.docker.example`, `next-env.d.ts`, `docs/bundle-optimization-todo.md`,
  `docs/np-cadrage.md`, `docs/self-hosted.md`, et les 8 `supabase/.temp/*` (cache local
  du CLI Supabase, ephemere). Reproduire fidelement l'etat reel de la carriere, y
  compris son absence de suivi git, est conforme a FR-1 — aucune decision editoriale
  prise ici pour forcer leur ajout.
- **5 fichiers** suivis sur `main` (`git show main:<path>` reussit) mais bloques par
  le `.gitignore` de `refork-v030` : `docs/demo-video-script.md`, `docs/features-showcase.md`,
  `docs/pilot-preparation.md`, `docs/quick-start.md`, `docs/stitch-prompts.md`. Cause
  racine identifiee : `.gitignore` n'est PAS dans OURS_ONLY (c'est un fichier BOTH_DIFFER,
  hors perimetre S0-002) ; le worktree porte encore la regle blanche `/docs` heritee brute
  de l'upstream v0.3.0, alors que `main` a une regle affinee (`/docs/*` + exceptions
  `!/docs/np-cadrage.md` et `!/docs/foundation/`). Reconciliation explicitement du ressort
  de S0-004 (application des diffs BOTH_DIFFER, dont `.gitignore`) — PAS touche ici pour
  respecter le perimetre strict de cette story (copie brute uniquement, zero adaptation).

Consequence pratique : le commit `[S0-002]` de cette story ajoute les 245 fichiers
nouveaux non ignores (`.ralph/progress.md` reste inchange, deja commite depuis S0-001).
Les 18 chemins ci-dessus restent presents sur le disque du worktree (l'acceptance
"264 fichiers presents sur refork-v030" est remplie au sens working-tree, verifiee par
le script lui-meme) mais pas encore dans l'historique git tant que S0-004 n'a pas
reconcilie le `.gitignore`. Point signale explicitement pour ne pas etre perdu de vue.

## Execution 2026-07-10T13:39:19

- Inventaire : `C:\projets\Qalem\refork\inventaire.json`
- Repo carriere (main) : `C:\projets\Qalem\OpenMAIC`
- Worktree cible : `C:\projets\Qalem\refork-v030-wt`
- Total OURS_ONLY attendu : 264
- Source `git show main:<path>` : 251
- Source repli filesystem (fichier non suivi sur main — gitignore/genere) : 13
  - Fichiers concernes par le repli filesystem (motif FR-1 : `git show` echoue car fichier absent de l'historique `main`, present seulement sur le disque du repo carriere) :
    - `.env.docker.example`
    - `docs/bundle-optimization-todo.md`
    - `docs/np-cadrage.md`
    - `docs/self-hosted.md`
    - `next-env.d.ts`
    - `supabase/.temp/cli-latest`
    - `supabase/.temp/gotrue-version`
    - `supabase/.temp/pooler-url`
    - `supabase/.temp/postgres-version`
    - `supabase/.temp/project-ref`
    - `supabase/.temp/rest-version`
    - `supabase/.temp/storage-migration`
    - `supabase/.temp/storage-version`
- Fichiers proteges (non ecrases, superset strict deja present dans le worktree) : 1
  - `.ralph/progress.md` : suivi actif du Ralph loop de re-fork (deja modifie par S0-001 dans ce worktree) ; le contenu main est un prefixe exact du contenu worktree (superset strict) -> ecraser detruirait l'entree Session Log S0-001
- Nouveaux fichiers ecrits : 0
- Fichiers mis a jour : 0
- Fichiers deja a jour (idempotence) : 263
- Erreurs : 0
- Verification post-copie : 264/264 conformes, ecarts = 0
- Hash sha256 de l'ensemble des 264 chemins (contenu concatene, ordre inventaire) : b8531895e4815528ad68ce9603e371f5a19667e7bb6bd0bb2a33f414472404b0
