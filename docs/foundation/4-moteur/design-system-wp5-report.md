# Rapport WP5 — Linter déterministe des slides

Date : 2026-10-09  
Branche : `feature/adaptive-design-system`  
SHA fonctionnel validé : `f73b66a2`

## Résultat

Le contrôle déterministe intervient dans le pipeline des slides adaptatives avant leur persistance. Il examine notamment la palette, le contraste (y compris les dégradés), le fond image, les tailles minimales, la zone sûre, les chevauchements, la capacité de texte, les familles de police et les règles de structure. Les réparations tentent d’abord la couleur puis le contraste, l’agrandissement sûr de la boîte et la réduction de corps ; un cas non réparable déclenche le chemin de régénération existant.

Le chemin sans directive ni instantané de charte ne passe pas par ce nouveau linter. Les fonctions de contrôle restent pures et ne font aucun appel réseau.

## Preuves au SHA `f73b66a2`

- Formatage, TypeScript et ESLint : code de sortie 0.
- Vitest : 557 fichiers et 3 450 tests réussis.
- Build de production : code de sortie 0, 127 routes produites.
- Playwright : 202 tests réussis en quatre shards (51 + 51 + 50 + 50), chacun terminé avec code de sortie 0.

## Limites explicitement restantes

- La conformité n’a pas été mesurée sur cinq cours nouvellement générés ni sur un échantillon représentatif de slides existantes ; aucun appel de génération ni quota n’a été consommé. Ce contrôle de terrain relève de WP10.
- L’estimation de capacité typographique est heuristique et ne mesure pas les glyphes avec la police réellement chargée dans chaque export.
- Le DSL actuel ne fournit pas de champ d’alternative textuelle ; le linter ne peut qu’avertir si une propriété alternative existe dans les données reçues.
- L’ordre de lecture est signalé selon une heuristique gauche-à-droite ; le traitement RTL fiable est reporté à WP8.
- La journalisation des métriques agrégées par règle relève de WP9.

WP5 est donc livré et validé sur les gates automatisées, mais sa recette de conformité sur des générations représentatives reste ouverte jusqu’à WP10.
