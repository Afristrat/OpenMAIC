# Contrat de probe de capacité

Un probe répond à une seule question : ce modèle peut-il exécuter maintenant une capacité métier précise par le transport configuré ?

## Entrée minimale

- identifiant du modèle tel qu'il apparaît dans l'inventaire courant ;
- capacité métier attendue ;
- charge utile minimale propre à cette capacité ;
- délai maximal explicite ;
- référence du script ou scénario de probe.

## Preuve recevable

Un code HTTP ou un endpoint de santé ne suffit pas. Le probe doit obtenir et contrôler un résultat propre à la modalité : texte non vide, vecteur de dimension attendue, média décodable, durée ou dimensions valides, transcription exploitable, selon le cas. Il consigne le résultat, la date, la latence, les limites observées et une référence vers l'artefact de preuve.

## Transitions

- présence dans LiteLLM : `referenced` ;
- probe métier réussi : `reachable` pour cette capacité ;
- évaluation de tâche réussie : `validated` pour ce couple tâche/capacité ;
- disparition de l'inventaire ou nouveau probe en échec : usage invalidé immédiatement, preuves antérieures conservées.

Pour ComfyUI, le mode `image_generation` décrit seulement le transport du sidecar. Le type de l'artefact contrôlé par le probe détermine la capacité réelle.

Les seuils de qualité et la décision de promotion appartiennent au contrat d'évaluation V-07, pas au probe de joignabilité.
