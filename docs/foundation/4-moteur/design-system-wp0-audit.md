# WP0 — Audit complémentaire du design system adaptatif

Date : 2026-10-09
Branche : `feature/adaptive-design-system`
État : audit statique partiel ; aucune génération réelle lancée.

## Constats confirmés dans le code

- Le modèle est résolu au runtime selon la route de scène, l’en-tête `x-model`, puis `DEFAULT_MODEL` ; le dépôt ne définit donc pas un modèle unique pour toutes les scènes (`lib/server/resolve-model.ts:55-70`). Les tailles de contexte et de sortie sont des métadonnées de catalogue, par exemple `lib/ai/providers.ts:72-73`. Le modèle réellement utilisé par l’instance doit être confirmé depuis sa configuration runtime, sans lire ni exposer les secrets.
- L’estimation de réservation interne n’est pas un tokenizer : `lib/ai/llm.ts:150-155` estime les tokens à partir de la taille sérialisée multipliée par deux, puis ajoute une réserve. Les tokens réellement facturés sont récupérés après l’appel (`lib/ai/llm.ts:218-234`). Aucun nombre exact de tokens d’un appel réel n’est donc déduit ici.
- Tailles statiques des gabarits, mesurées en octets par `Get-Item` : `slide-content/system.md` 30 954 ; `slide-content/user.md` 2 045 ; `andragogy-system-override.md` 4 867 ; `requirements-to-outlines/system.md` 23 982 ; `requirements-to-outlines/user.md` 5 132. Ces mesures n’incluent aucune variable, source, persona ni média.
- Le moteur de gabarits prend en charge les blocs conditionnels non imbriqués (`lib/prompts/loader.ts:50-67`) et leur traitement précède l’interpolation (`lib/prompts/loader.ts:121-143`). Le prompt peut donc employer de courts blocs conditionnels par type, avec un seul niveau d’imbrication.
- `TextType` est l’union `title`, `subtitle`, `content`, `item`, `itemTitle`, `notes`, `header`, `footer`, `partNumber`, `itemNumber` (`packages/@openmaic/dsl/src/slides.ts:167-177`).
- Le texte DSL expose `lineHeight`, `wordSpace`, `paragraphSpace`, `vertical`, `textType`, `vAlign`, ainsi que couleur, police, opacité, ombre et contour (`packages/@openmaic/dsl/src/slides.ts:208-228`). Le lecteur applique notamment interligne, espacement de lettres et espacement de paragraphe (`packages/@openmaic/renderer/src/elements/text/BaseTextElement.tsx:52-68`). Le PPTX mappe ces champs vers ses propriétés de texte, avec `autoFit: true` (`lib/export/use-export-pptx.ts:528-562`).
- Aucun champ `alt` ou `altText` n’apparaît sur `PPTImageElement` (`packages/@openmaic/dsl/src/slides.ts:327-345`). La présence d’un `name` sur l’élément n’est pas une alternative textuelle.
- L’image possède un champ `radius`; une forme générique ne possède pas de rayon dédié et repose sur un chemin SVG (`packages/@openmaic/dsl/src/slides.ts:417-434`). Les ombres et opacités ont des champs DSL, mais leur fidélité doit être testée séparément dans chaque export.
- Le pipeline de régénération de scène utilise le modèle résolu par scène ; les modèles de fournisseurs et leurs fenêtres sont configurés dans `lib/ai/providers.ts`. Le code d’assemblage audité n’impose pas de cache de prompt applicatif ; la présence d’un cache fournisseur dépend du fournisseur et de sa configuration runtime, non prouvée ici.

## Mesures restantes pour fermer WP0

1. Compter les caractères et tokens des prompts assemblés pour les trois scénarios du brief. Les tailles statiques ci-dessus ne sont pas une mesure en tokens et n’incluent pas les valeurs dynamiques.
2. Relever l’identifiant du modèle par défaut et vérifier le cache éventuel sur le conteneur Qalem actuellement servi. La résolution de modèle est dynamique ; aucune valeur runtime n’est certifiée par le dépôt source seul.
3. Mesurer cinq chartes tenant anonymisées après sérialisation. Il faut identifier la base Qalem exacte avant toute lecture ; aucune charte ni identité de tenant n’a été extraite.
4. Vérifier le rendu réel des arrondis, ombres et opacités dans le lecteur, PowerPoint, MP4 et SCORM.

Ces mesures restent nécessaires à la fermeture de WP0. Le reste du travail logiciel ne doit pas transformer ces mesures manquantes en affirmations.

## Vérification de l’environnement serveur

La connexion SSH à `serveuria` fonctionne. Le conteneur d’exécution persistant
`qalem-refork-exec` est au SHA `6b4e52c2`, différent du SHA local de départ
`b416c7f1` ; il ne constitue donc pas une base fiable pour compter les tokens
des gabarits de cette branche. L’inventaire Docker montre `qalem-workers`,
`qalem-lrs`, des bases `qalem-s6004-*` et des conteneurs de validation, mais
n’identifie pas sans ambiguïté le conteneur web de production `qalem.ma`. Je
n’ai consulté aucune variable d’environnement, aucun secret ni aucune charte de
tenant. Il faut d’abord établir la correspondance du conteneur de production et
de sa base avant d’attribuer un modèle ou de lire des chartes.

## Structure des lots

La version 1.1 contient bien les lots WP0 à WP10, sans trou. Le constat initial
d’un WP5 manquant était erroné et est retiré.
