# @openmaic/omml2mathml

Fork interne maintenu de [`scienceai/omml2mathml`](https://github.com/scienceai/omml2mathml),
version 1.3.0, sous licence Apache-2.0.

Qalem remplace le DOM `jsdom` historique par `@xmldom/xmldom`, déjà utilisé par
l’importeur. Cette modification retire le sous-arbre obsolète `get-dom → jsdom → request`
sans changer les règles de conversion OMML vers MathML.

Les fichiers `index.js` et `operators.js` proviennent du projet original et portent
une notice de modification explicite conformément à la licence Apache-2.0.
