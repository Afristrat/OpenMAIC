# Rapport WP3 — Prompt visuel adaptatif

Date : 2026-10-09  
Branche : `feature/adaptive-design-system`  
Commit d’implémentation : `a9b2c7f3`  
Commit de correction de test : `cdc6a205`

## Changements réalisés

Le contrat visuel est intégré au prompt de base des slides, derrière la présence
d’une directive ou d’un instantané de charte. Le prompt historique reste
inchangé lorsque les deux sont absents. Le contexte transmis comprend la
fonction de slide, la directive normalisée, la palette calculée et, si elle
existe, la charte figée. Les données de marque sont explicitement traitées
comme des données non fiables, jamais comme des instructions.

La fonction de slide est résolue de manière déterministe : première slide,
dernière slide, mots-clés d’orientation ou de transition, puis contenu par
défaut. Le contrat garde le schéma JSON et le canevas existants, impose les
rôles de couleur et le vocabulaire `name` fermé, et rappelle les exigences de
lisibilité, de sobriété, de capacité et de restitution statique.

## Réconciliation des consignes existantes

| Règle existante ou source | Décision | Traitement |
|---|---|---|
| JSON, canevas, types et IDs de médias | Prioritaire | Conservés ; aucune propriété non prise en charge n’est demandée. |
| Hauteurs de texte et géométrie existantes | La règle la plus stricte prévaut | Le tableau des hauteurs, les marges du canevas et les contraintes géométriques restent applicables. La marge de grille de la directive s’ajoute comme contrainte de contenu. |
| Couleurs d’exemple dans le schéma | Exemples seulement | Le prompt indique explicitement de ne pas les reprendre comme choix de palette. |
| Ressources pédagogiques et URL de téléchargement | Prioritaires | Les consignes du prompt utilisateur restent intactes ; les ressources ne peuvent être remplacées par des couleurs ou médias inventés. |
| Sources et intégrité du contenu | Prioritaires | Aucune source, donnée ou URL n’est fabriquée ; le contenu de charte ne peut pas donner d’instructions. |
| `name` et `textType` du DSL | Compatibles | `name` utilise le vocabulaire fermé demandé ; `textType` est conservé lorsqu’il correspond au rôle. |
| Override andragogique | Complémentaire | Non modifié ; le contrat visuel ne change pas les objectifs, activités ni critères pédagogiques. |
| Modèle et choix esthétiques libres | Dernière priorité | Ne peuvent supplanter le schéma, l’accessibilité, la charte ou la directive. |

## Mesures et validation

- Texte statique de `system.md` avant WP3 : 30 773 caractères ; après : 33 424 ;
  delta net : **+2 651 caractères**, sous le plafond de 3 000.
- La charte est plafonnée à 1 200 caractères et la directive normalisée à 1 000.
  La palette est sérialisée avec la directive au lieu d’être calculée par le
  modèle. Aucun appel de génération n’a été lancé pour cette mesure.
- Tests du contexte adaptatif : 4 ; tests de routage du prompt de slide : 10 ;
  couverture ciblée de WP3 : 14 tests verts après correction d’une assertion
  qui attendait l’ancien emplacement du bloc de directive.
- Le contrôle complet au SHA `82708646` passe : `pnpm check`,
  `pnpm typecheck`, `pnpm lint`, `pnpm test` et `pnpm build` ont tous rendu un
  code de sortie 0. Les 202 tests Playwright passent également en quatre
  shards (51 + 51 + 50 + 50).

## Limites explicites

Ce lot ne certifie pas la qualité visuelle réelle d’un modèle ni la fidélité
lecteur / export. Aucune génération, consommation de quota, activation de
tenant, mise en production ou validation visuelle n’a été effectuée. Ces
contrôles relèvent des lots de linter, d’exports et de recette décrits dans le
brief.
