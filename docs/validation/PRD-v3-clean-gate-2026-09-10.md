# PRD v3 — Recette sur copie propre, 10 septembre 2026

## Périmètre

ServeurIA, conteneur `qalem-refork-exec`, worktree détaché créé depuis le commit
poussé, sans reprendre le dossier enrichi `.codex-gate-s3-008-fe6ebba`.
Répertoire temporaire dans le conteneur : `/tmp/qalem-prd3-9c2043c.nDJBmn`.
Ce dossier et ses journaux sont éphémères ; ce document est la preuve versionnée.
Le checkout principal du serveur, modifié, n’a pas été réinitialisé ni changé de
branche. Limite du conteneur relue : 10 Gio, mémoire avec swap 20 Gio.

## Installation et premier passage

- Source : `9c2043c0ccdad8ce4ef3be3c801562d933631f05`.
- Installation `pnpm install --frozen-lockfile --prefer-offline` réussie, y compris
  les builds des packages et la synchronisation du composant d’import.
- Session 89101, exit 0 : format, TypeScript et lint complets.
- Aucun fichier suivi modifié après installation ; répertoire de dépendances
  omml2mathml non suivi uniquement.
- Session 15891, exit 1 : 3 249 tests réussis, deux échecs sur 3 251.
  Le test du layout privé attendait encore le seul enfant au lieu de l’enfant
  et de la bannière. Le test audio ne simulait pas le client service introduit
  pour le stockage serveur. Aucun secret injecté pour contourner cet échec.

## Corrections et deuxième passage

Commit `e829fa7c577f7695ece4d9ccf1c0aa87d952f96b`, poussé et relu sur origin.
Deux fichiers de tests adaptés au contrat actuel, aucun code applicatif changé.
Le test du layout vérifie aussi la bannière ; le test audio vérifie le bucket,
le signal borné et l’absence de client privilégié sans authentification ou accès
à la session. Session 99600, exit 0 : dix tests ciblés, TypeScript/lint.

Le worktree serveur a ensuite été positionné sur e829fa7 après comparaison
exacte des deux fichiers avec le commit reçu, sans modification suivie restante.
Suite complète `pnpm test --maxWorkers=2` : **520 fichiers, 3 252 tests réussis**,
aucun échec. Journal `unit-gate-e829fa7.log`, session 43009.

La construction de production `pnpm build` a réussi dans la même session
43009, exit 0 : compilation, TypeScript, 123 pages statiques et vérification
`assert-standalone-routes` réussies (routes publiques publiques, `/app` privé).
Sentry signale l’absence de jeton pour créer une release ; ce passage ne constitue
donc pas une affirmation de build sans avertissement. Aucun secret ajouté.

## Recette navigateur

Commande : `CI=true E2E_PORT=3017 pnpm exec playwright test --retries=0`.
Session 44834, journal `e2e-clean-e829fa7.log`. Reconstruction E2E distincte
du build de production, serveur non réutilisé, un worker Chromium sans interface
visible. Aucun credential réel : configuration de test fournie par Playwright.
Résultat final 44834, exit 1 : **192 réussis, un échec**, 8,1 minutes.
La discussion avec collecte réussit ses assertions voix/observations/rapport,
mais le second changement de langue échoue : menu arabe détaché du DOM.
Reproduction inchangée avec trace, session 39833 : même échec, autre scénario
sans collecte réussi. La trace situe les deux sélections à 140 ms d’intervalle.

Correction limitée au test : attendre que le menu Radix soit caché après la
sélection du français, avant sa réouverture. Pas de pause arbitraire ni retry.
Session 39443, exit 0 : format du fichier, TypeScript/lint complets et les deux
scénarios vocaux réussis en 12,9 secondes sur le build E2E existant. Aucun code
applicatif changé. La suite de 193 scénarios n’a pas été entièrement relancée
après cette correction : ne pas présenter le gate global comme entièrement vert.
La skill de diagnostic a imposé la reproduction avant cette modification.

## Limites

Ce passage ne prouve ni les parcours navigateur de l’ensemble du PRD, ni
l’application coordonnée des migrations, ni la recette réelle de collecte ou
l’effet du Director en production. Aucune US n’est fermée par ce seul document.
Aucun déploiement, changement de collecte ou rotation de credentials.
Les skills d’isolation/Ponytail/Supabase ont conduit à reconstruire les
dépendances séparément et à préserver les frontières d’autorisation dans les
tests, sans nouvelle dépendance ou modification SQL.
