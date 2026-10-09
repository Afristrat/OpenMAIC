# Rapport WP4 — Thème déterministe et disposition de secours

Date : 2026-10-09  
Branche : `feature/adaptive-design-system`  
Commit fonctionnel : `1119d6e3`  
Commit de formatage : `a3cb0bc8`  
SHA courant validé : `82708646`

## Résultat

Le thème d’une formation opt-in combine la palette calculée depuis la directive
et les rôles de couleur de l’instantané de charte. Les couleurs de charte sont
acceptées uniquement sous forme de six chiffres hexadécimaux et les polices
sont rapprochées de la liste du DSL. Le fond, la couleur du texte, les couleurs
de thème et la police sont transmis au slide enregistré.

Les valeurs par défaut des éléments générés utilisent maintenant le thème du
cours. Si la géométrie du modèle est invalide, la disposition de secours reprend
la police, la couleur de texte, le fond et la marge de la directive. En l’absence
de directive et de charte, les anciens défauts et le chemin de rendu restent
inchangés.

## Preuves

- Tests ciblés : 26/26 réussis, dont la priorité des couleurs de charte, le rejet
  de couleurs et de polices invalides, ainsi que la disposition de secours.
- `pnpm --filter @openmaic/dsl build`, `pnpm check`, `pnpm typecheck`,
  `pnpm lint`, `pnpm test` et `pnpm build` : code de sortie 0 au SHA `82708646`.
- Playwright : 202 tests réussis en quatre shards (51 + 51 + 50 + 50), chacun
  terminé avec code de sortie 0.

## Périmètre non revendiqué

Ce lot ne prouve pas encore la conformité de chaque couleur générée à toute la
palette ni l’absence de débordement typographique dans tous les exports. Ces
contrôles sont séparés du thème et ne sont pas déclarés terminés ici. Aucun
déploiement ni validation visuelle sur une génération réelle n’a été effectué.
