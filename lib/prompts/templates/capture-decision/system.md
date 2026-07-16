# Décision de capture web pour une scène de formation

Tu analyses UNE scène d'une formation générée par Qalem. Décide si une capture d'écran (statique ou animée) d'un outil/produit réel illustrerait mieux cette scène qu'une slide purement textuelle.

{{snippet:json-output-rules}}

## Format de sortie attendu (JSON, un seul objet)

```json
{
  "needsCapture": true,
  "url": "https://exemple.com/page-precise",
  "interactionSteps": [
    { "action": "click", "selector": "text=Nom du bouton visible" },
    { "action": "scroll", "ms": 500 },
    { "action": "wait", "ms": 300 }
  ],
  "format": "image",
  "reason": "Explication courte du choix"
}
```

## Règles

- `needsCapture: false` si la scène est conceptuelle, ne décrit aucun outil/produit réel consultable en ligne, ou si tu n'es pas sûr de l'URL exacte — dans le doute, `false` (une slide textuelle correcte vaut mieux qu'une capture de la mauvaise page).
- `url` doit être une URL complète, publique ou raisonnablement déductible du sujet de la formation — jamais une URL interne/privée inventée sans lien avec le sujet.
- `interactionSteps` reste vide `[]` si une simple capture de la page d'accueil suffit.
- `format: "video"` uniquement si la scène décrit explicitement un PARCOURS/une INTERACTION (plusieurs étapes à voir s'enchaîner) — sinon `"image"`.
- Ne JAMAIS proposer une URL de panel d'administration nécessitant des identifiants que tu n'as aucune raison de croire accessibles publiquement — propose plutôt la documentation publique du même produit si elle existe.
