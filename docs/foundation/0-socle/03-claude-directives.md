# 03 — Directives Claude · Chantier 0 — SOCLE

> **Fil conducteur** — Ce document remplace, pour CE chantier, le rôle du « CLAUDE.md » de la spec np (adaptation consignée en ADR-007 : un seul CLAUDE.md racine par repo, cinq chantiers → un fichier de directives par dossier, le CLAUDE.md racine restant le tronc commun). Aval : les 03 des chantiers 1-4 héritent de celui-ci et n'ajoutent que leur spécifique.

## Identité (3 lignes)

Chantier de **portage par copie-adaptation** : v0.3.0 (MIT) + nos personnalisations existantes, exécuté par Ralph loop sur branche `refork-v030`. Rien n'est recodé : tout existe soit dans `upstream-v030/` soit dans la carrière `main`. Le produit du chantier est une base unique verte sur laquelle tout le reste se construit.

## Règles spécifiques au chantier (le CLAUDE.md global et celui du repo s'appliquent déjà — non recopiés)

1. **Branche** : tout le travail sur `refork-v030`. `main` est une **carrière en lecture seule** — aucun commit dessus hors hotfix prod explicitement demandé par Amine (qui serait alors à reporter sur `refork-v030` dans la même session).
2. **Copier-adapter, jamais recoder** : avant d'écrire une ligne, chercher le fichier équivalent dans la carrière (`git -C <repo> show main:<path>` ou `refork/inventaire.json` comme catalogue). Écrire du neuf uniquement si la carrière n'a rien (et le dire dans le commit).
3. **Commits** : format `[S0-XXX] Titre exact de la story`, une story par itération, jamais hors scope.
4. **Quality gate avant tout `passes=true`** : `npx tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e` — zéro erreur, zéro warning toléré (règle n°3 globale).
5. **Données** : avant de toucher au schéma, lire `02-data-dictionary.md` du dossier ; toute création/modification le met à jour dans le même commit.
6. **Décisions** : toute décision non triviale → entrée ADR dans `08-decisions-log.md` du dossier (Quoi/Pourquoi/Sources/Alternatives rejetées).
7. **Erreurs** : tout bug > 15 min → entrée `09-errors-log.md` ; au début d'une session de debug, LIRE ce fichier d'abord.
8. **i18n/RTL** : toute string UI passe par `t()` dans les 3 locales ; tout composant porté se vérifie en ar-MA. Les checkpoints humains (passe RTL visuelle, liste garder/abandonner, canevas d'import) ne se déclarent JAMAIS faits par l'agent — ils s'ouvrent comme questions à Amine.
9. **Ponytail** : régime full ; à chaque fin de story Ralph : `/ponytail-debt` — tout marqueur sans déclencheur se corrige séance tenante.
10. **Soft fork** : README/CONTRIBUTING/CHANGELOG upstream v0.3.0 intouchés sur la nouvelle base.

## Pointeurs

- Avant une story : `04-feature-backlog.md` (v1 gelée) · avant les données : `02-data-dictionary.md` · dépendances externes : `05-integrations.md` · état du flow global : `docs/np-cadrage.md`.
