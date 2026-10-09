# WP10 — Recette de génération représentative

Date : 2026-10-09

Branche : `feature/adaptive-design-system`

## Verdict

WP10 n’est pas certifié. Le code adaptatif dispose de tests déterministes et les
gates de code sont documentées dans les rapports WP1 à WP9, mais aucune des cinq
générations réelles requises n’a été lancée. Une recette avec des réponses
simulées ne prouverait ni l’usage réel des ressources, ni le comportement du
modèle, ni le rendu obtenu. Aucun cours de production ni quota fournisseur n’a
été consommé pour fabriquer une preuve artificielle.

## Preuves disponibles

- WP1 à WP6 documentent les tests du contrat, de la persistance, du prompt, du
  thème, du linter, des scènes HTML et des exports. Ces tests sont utiles pour
  détecter les régressions de code, pas pour certifier le résultat d’un modèle.
- WP9 expose le réglage par tenant, les métriques agrégées et les règles du
  linter. Le flag est désactivé par défaut ; aucun tenant n’a été activé.
- Au SHA `2850bfac`, la suite complète a passé 559 fichiers et 3 462 tests, le
  build de production a passé, et le parcours Playwright s’est terminé à
  201/202 lors du premier passage. Le cas restant, widget publié en français,
  échouait sur un conflit IndexedDB dans la suite complète, puis a passé seul
  en 1/1. La suite E2E complète n’est donc pas déclarée verte.
- Aucun contrôle visuel côte à côte du lecteur, du PPTX, du MP4 et du SCORM à
  partir des mêmes cinq formations n’a été exécuté.

## Recette à exécuter pour fermer WP10

Sur un tenant de recette isolé, avec le flag activé pour ce seul tenant et un
budget de génération autorisé, produire cinq formations représentatives :

1. sécurité ou procédure métier ;
2. contenu technique ;
3. finance ou données chiffrées ;
4. management ou compétences relationnelles ;
5. sujet sensible ou à risque de stéréotype.

Pour chacune, conserver l’identifiant du stage et le modèle réellement résolu,
confirmer que les ressources autorisées sont citées et utilisées, vérifier les
règles du linter, les replis et la télémétrie, puis inspecter le lecteur et les
exports réellement requis. Relever les défauts, les corriger, puis rejouer les
cinq parcours. Les métriques de coût doivent être interprétées dans la devise
de facturation du tenant ; une mesure absente reste « non mesurée ».

La recette ne doit pas être déclarée verte si un cours échoue, si une ressource
est ignorée, si un repli non expliqué apparaît, si le coût est présenté comme
zéro sans tarif, ou si un export requis diverge de manière incompatible avec
son usage.

## Conditions de lancement

Le dépôt ne prouve pas l’existence d’un tenant isolé réservé à cette recette ni
un budget de quotas qui lui est affecté. Le feu vert au travail sur la branche
ne vaut pas autorisation de consommer un quota de production. Le résidu est donc
circonscrit : désigner ou créer un tenant de recette isolé et autoriser un
budget explicite ; ensuite, exécuter la recette ci-dessus. Aucun déploiement,
activation ou appel de génération réel n’a été effectué.
