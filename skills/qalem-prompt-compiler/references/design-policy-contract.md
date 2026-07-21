# Contrat des politiques de design

Une politique chiffrée n'est jamais une constante universelle. Elle doit porter les éléments suivants :

- une métrique explicite ;
- une plage et son unité ;
- des conditions structurées relatives à la compétence, au public, au risque et à la modalité ;
- une justification ;
- un déclencheur de réexamen ;
- une méthode de mesure ;
- au moins une référence de preuve ou d'évaluation.

Le résolveur `lib/formation-engine/design-policies.ts` ne contient aucune plage par défaut. Sans politique applicable, la métrique reste `unconstrained`. Plusieurs politiques compatibles produisent l'intersection de leurs plages ; des unités ou plages incompatibles produisent `conflict` et bloquent la compilation jusqu'à arbitrage.

Ce contrat distingue l'utilisation d'un cadre de sa transformation en dogme. Il permet de tester ultérieurement des valeurs par secteur, audience et modalité sans modifier le compilateur.
