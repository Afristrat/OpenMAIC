# S6-004 — Recette multisource de production

Date : 12 septembre 2026  
Application : Qalem web déployé au SHA `9a24e105e79638e46b97c6f0109c47e097ca0000`

## Parcours exécuté

La recette `scripts/proofs/s6-004-production.js` s’exécute dans le conteneur
web avec sa configuration déjà injectée. Elle ne produit ni valeur de secret,
ni identifiant de personne, ni contenu de source. Deux comptes de recette et
deux organisations actives sont créés puis supprimés dans le même flux.

| Contrôle | Résultat |
|---|---:|
| Ajout de sources autorisées par le premier tenant | 3 × HTTP 201 |
| Doublon du premier document | HTTP 200, même source réutilisée |
| Document sans texte exploitable | HTTP 422 |
| Manifeste complet, retrait, puis réutilisation | versions 1 → 2 → 3 |
| Lecture adverse de la bibliothèque | HTTP 403 |
| Écriture adverse du manifeste | HTTP 403 |

Les tests ciblés du SHA fonctionnel `d7e231a` passent également : 8/8 Vitest
dans `tests/api/source-library-api.test.ts` et
`tests/server/formation-source-library.test.ts`. Ils couvrent les références
stables, la contradiction explicitement exposée, les parcours source unique et
sans source, ainsi que les frontières API.

## Nettoyage et limites

Après chaque recette, le contrôle PostgreSQL ne trouve aucun utilisateur Auth,
tenant, `organization_sources` ni `formation_source_manifests` dont le marqueur
de recette est `s6004-*` : quatre recomptages à zéro. Cette preuve clôt S6-004
au SHA déployé. Elle ne ferme pas S6-003 ni les modules NotebookLM, Notion et
Drive : ces connecteurs restent des contrats Diwan séparés.
