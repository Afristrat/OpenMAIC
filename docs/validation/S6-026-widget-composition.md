# S6-026 — Grammaire bornée des compositions de widgets

Date de certification : 2 septembre 2026  
Branche : `refork-v030`  
SHA fonctionnel exact : `0608486e679bf9725d0d323d4df20bc76adc3b84`

## Résultat

Le contrat déclaratif v1 est implémenté dans `lib/plugins/widget-composition.ts`. Il n'autorise que sept briques : texte, entrée numérique, valeur calculée, condition, tableau, graphique en barres et layout. Les schémas Zod sont stricts : une brique, une propriété ou une référence inconnue est rejetée.

Les calculs utilisent un AST fermé aux littéraux, références, addition, multiplication, minimum, maximum, soustraction, division et arrondi. Aucune expression textuelle exécutable, aucun HTML, aucun JavaScript, `eval` ou `Function` n'est accepté.

Les limites portent sur la profondeur de l'AST, son nombre de nœuds, les entrées, les calculs, les briques, les racines et les cas de référence. La validation refuse aussi les doublons, références absentes, cycles de calcul, cycles de layout, divisions par zéro et résultats non finis.

## Preuve TDD

- `e888c06` : le test est ajouté avant l'existence du module ; l'import échoue.
- `7212f3e` : le module devient importable, mais cinq assertions comportementales restent rouges sur l'implémentation volontairement absente.
- `be10e87`, `27773cd`, `18ff236`, `0608486` : implémentation, formatage, raffinement de type puis correction de la fixture afin qu'elle mesure uniquement le cycle visé.

Les six tests permanents couvrent une composition française, un cas arabe `ar-MA` en RTL, les saisies, la chaîne de calcul, les frontières strictes et les cycles. L'union autorisée ne contient aucune brique 3D ou vidéo.

## Gate exact sur ServeurIA

La validation a été exécutée dans un clone Docker isolé, détaché au SHA fonctionnel exact :

- Prettier : vert ;
- TypeScript : zéro erreur ;
- ESLint : zéro erreur et zéro avertissement ;
- Vitest : 413 fichiers sur 413, 2 606 tests sur 2 606 ;
- build Next.js : 104 pages sur 104 ;
- Playwright Chromium : 97 parcours sur 97, `--retries=0`, en 4,3 minutes.

S6-026 ne publie encore aucun template et ne modifie pas la production. La persistance, les versions immuables, la RLS et les routes super-administrateur relèvent de S6-027.
