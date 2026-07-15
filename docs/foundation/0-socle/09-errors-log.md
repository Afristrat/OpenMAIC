# 09 — Errors log · Chantier 0 — SOCLE

> **Fil conducteur** — Journal des erreurs PAYÉES du chantier socle ; les chantiers 1-4 ont chacun le leur. Règle transverse : une erreur généralisable à toute la plateforme remonte AUSSI dans celui du socle (ce fichier), qui fait office de tronc.

## Règles d'usage (à lire, pas à décorer)

- **QUAND écrire** : tout bug > 15 minutes de debug ; toute erreur en préprod/prod ; toute erreur d'outillage (script de portage, CI) qui se reproduira.
- **Format** : date · symptôme · cause RACINE (pas le contournement) · fix · leçon généralisable.
- **Pour Claude Code** : au début d'une session de debug sur ce chantier, LIRE ce fichier d'abord — l'erreur a peut-être déjà été payée.

## Entrées

### 2026-07-09 — `npx tsc --noEmit` → MODULE_NOT_FOUND
- **Symptôme** : typecheck impossible, `typescript` introuvable alors que `node_modules/` existe.
- **Cause racine** : `node_modules` incomplet (installation interrompue) ; le premier `pnpm install` a échoué en non-TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).
- **Fix** : `CI=true pnpm install` → install complète → typecheck 0 erreur.
- **Leçon** : en session agent (non-TTY), TOUJOURS `CI=true pnpm install`. S'applique telle quelle à S0-001.

### 2026-07-09 — `git clone` upstream → timeout
- **Symptôme** : clone de `THU-MAIC/OpenMAIC` interrompu à 3 min.
- **Cause racine** : dépôt volumineux + réseau ; le clone complet n'était pas nécessaire au besoin (comparer une version précise).
- **Fix** : archive tag `https://github.com/THU-MAIC/OpenMAIC/archive/refs/tags/v0.3.0.zip` téléchargée en arrière-plan (98 Mo), dépliée dans `upstream-v030/`.
- **Leçon** : pour comparer/porter une version figée, préférer l'archive du tag au clone. S0-001 part de cette archive vérifiée.

### 2026-07-09 — Comparaison de forks : « à la main » impossible, script obligatoire
- **Symptôme** : estimation de l'écart fork/upstream impossible à fiabiliser par lecture (1 119 fichiers annoncés par GitHub, catégories mélangées).
- **Cause racine** : un diff brut ne distingue pas « à nous seulement / upstream seulement / divergent » — c'est la catégorie qui décide de l'action, pas le diff.
- **Fix** : `refork/compare_trees.py` (inventaire trilatéral, tri par ampleur) → 264/845/312/257.
- **Leçon** : toute décision de portage se prend sur inventaire scripté, jamais sur échantillon. Le script est rejouable si l'upstream publie une v0.3.x.
