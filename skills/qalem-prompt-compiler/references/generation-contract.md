# Contrat de génération Qalem

## Champs structurants

| Domaine | Champs |
|---|---|
| Transformation | problème observable, situation initiale, comportement cible, preuve attendue |
| Public | rôles, expérience, langues, littératie, accessibilité, contexte culturel |
| Travail | tâches réelles, outils, contraintes, risques, erreurs coûteuses |
| Dispositif | durée, synchronie, taille, infrastructure, accompagnement, budget |
| Contenu | sources autorisées, fraîcheur, juridiction, controverses, terminologie |
| Évaluation | performance observable, conditions, seuil, feedback, transfert différé |
| Médias | utilité pédagogique, modalité, style, langue, voix, droits, accessibilité |
| Exploitation | canaux, LMS, export, partage, persistance, confidentialité, rétention |

## Politique de questions

Classer chaque champ : `known`, `inferred`, `unknown_non_blocking` ou `unknown_blocking`.

Une question est bloquante uniquement si sa réponse change au moins un élément parmi : objectif mesurable, public, risque, langue, durée, modalité, source autorisée, évaluation, accessibilité, diffusion ou modèle requis.

Pour chaque inférence, conserver la preuve et la confiance. Ne jamais transformer une absence de réponse en fait.

Le moteur exécutable `lib/formation-engine/progressive-framing.ts` applique un seuil de confiance explicite, fixé à `0,75` par défaut et modifiable par le consommateur. Une inférence située sous le seuil redevient inconnue. Les champs relatifs aux sources, à la confidentialité, à l’accessibilité, à l’infrastructure et à la taille du groupe deviennent bloquants uniquement lorsque le contexte de risque, de diffusion, de média ou de synchronie le justifie.

Les questions sont disponibles nativement en français, arabe standard moderne et anglais. Chaque question expose aussi les décisions de design qu’elle peut modifier ; aucune question n’est posée pour compléter un formulaire par principe.

## Heuristiques

Les ratios de théorie, pratique, pair learning ou contextualisation sont des variables de design. Les déterminer à partir de la nature de la compétence, du niveau, du risque, du temps et des conditions d’exercice. Documenter la justification et la méthode de mesure.
