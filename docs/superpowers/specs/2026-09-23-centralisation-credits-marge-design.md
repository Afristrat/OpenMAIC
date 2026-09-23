# Centralisation des crédits, des usages et de la marge

## Décision

Qalem doit appliquer automatiquement une politique de consommation de crédits à tous les tenants et à tous leurs utilisateurs. Le débit des crédits ne dépend plus de la présence d'un prix de vente, d'un coût fournisseur ou d'un taux de change. La valorisation économique reste distincte, dans le même cockpit d'administration, et la cible de marge moyenne de 95 % demeure un garde-fou sans devenir une formule de prix.

Cette décision corrige l'état constaté en production le 23 septembre 2026 : Human Yo Impact possédait 1 000 crédits, mais aucun tenant n'avait le débit réel activé, aucun barème de consommation n'était configuré et le référentiel de coûts ne couvrait que deux opérations de recherche web.

## Objectifs

- Débiter chaque usage facturable, quel que soit l'utilisateur membre du tenant, sans configuration individuelle.
- Donner aux nouveaux tenants une politique fonctionnelle dès leur création et reprendre les tenants existants sans réécrire leur historique.
- Conserver un ledger immuable, rapprochable et idempotent.
- Afficher chaque consommation avec sa date, son auteur, sa catégorie, sa quantité, ses crédits et son statut.
- Centraliser dans un seul cockpit la politique de crédits, les coûts fournisseurs, les prix à la valeur et la marge.
- Ne jamais déduire automatiquement le prix de vente du coût fournisseur.
- Rendre visibles les usages non valorisés afin qu'ils ne disparaissent pas des calculs ni des alertes.

## Séparation des responsabilités

### Politique de crédits

Une politique globale versionnée définit les unités et les taux de consommation par défaut. Elle s'applique à tous les tenants. Une dérogation versionnée par tenant reste possible depuis le cockpit central.

Barème initial recommandé, modifiable sans déploiement :

| Unité | Consommation |
|---|---:|
| 1 000 jetons LLM en entrée | 1 crédit |
| 1 000 jetons LLM en sortie | 3 crédits |
| 60 secondes de synthèse vocale | 1 crédit |
| 60 secondes de transcription | 1 crédit |
| 1 image | 5 crédits |
| 1 seconde de vidéo | 1 crédit |
| 1 Gio de média stocké | 1 crédit |
| 1 opération de recherche ou outil | 1 crédit |

Le barème exprime la consommation du produit. Il n'est ni un prix en devise, ni un coût fournisseur, ni un calcul de marge.

### Prix à la valeur

Le prix vendu reste saisi par tenant, unité, devise, date d'effet et justification commerciale. Aucune fonction ne calcule ce prix à partir du coût ou de la cible de marge.

### Coûts fournisseurs

Les coûts sont versionnés par fournisseur, modèle, unité et devise. Leur actualisation peut être automatisée par une tâche planifiée lorsque la source est fiable. Une donnée absente ou périmée doit être signalée, jamais remplacée silencieusement par zéro.

### Marge

La marge est calculée uniquement lorsque prix, coût et conversion sont disponibles. La cible globale par défaut est 95 %. Une marge inférieure déclenche une alerte et un diagnostic. Elle ne modifie automatiquement ni le prix, ni le barème de crédits, ni les droits du tenant.

Un usage débité mais non valorisable porte explicitement le statut `pending_configuration`. Il apparaît dans le cockpit avec la cause exacte : prix absent, coût absent ou taux de change absent. Il est exclu du taux de marge calculé et inclus dans un compteur d'exposition non valorisée.

## Modèle de données

### Politique globale

Une table privée `platform_credit_burn_rates` conserve les versions globales : unité, crédits en microunités, base de quantité, date d'effet, justification et auteur. Les versions sont immuables et leurs périodes ne peuvent pas se chevaucher.

`tenant_credit_burn_rates` reste la table des dérogations. La résolution choisit d'abord la version active du tenant, puis la version globale active. L'absence des deux échoue fermée avant l'appel fournisseur.

### Contrôle d'application

Le débit est actif par défaut au niveau de la plateforme. `tenant_billing_controls` ne sert plus à rendre facultatif le décompte ordinaire. Il conserve la devise de vente, les unités autorisées et une suspension exceptionnelle, réservée aux super-administrateurs et obligatoirement motivée et auditée.

La création d'un tenant initialise son portefeuille, son contrôle et l'allocation du plan de découverte dans la même transaction. Les tenants existants reçoivent le contrôle par défaut sans modification de leur solde. Toute allocation de rattrapage utilise une clé d'idempotence stable.

### Réservation et règlement

`tenant_usage_reservations` conserve toujours le barème de crédits utilisé. Les références économiques deviennent optionnelles tant qu'une valorisation n'est pas possible. La réservation débite le plafond estimé, le règlement rembourse ce plafond puis débite la consommation réelle.

Si l'appel fournisseur échoue, la réservation est intégralement remboursée. Si la valorisation économique échoue après un usage fournisseur réussi, le débit réel reste valide et l'usage devient `pending_configuration`. Une reprise idempotente pourra produire le snapshot économique ultérieurement sans toucher au ledger de crédits.

## Expérience d'administration

### Super-administration

Le cockpit économique central présente dans cet ordre :

1. santé du décompte global et nombre de tenants couverts ;
2. barème global de crédits et dérogations ;
3. coûts fournisseurs, source et fraîcheur ;
4. prix à la valeur par tenant ;
5. marge pondérée, cible 95 % et expositions non valorisées ;
6. détail filtrable par tenant, utilisateur, unité, fournisseur, modèle, période et statut.

Une activation manuelle tenant par tenant n'est plus le parcours normal.

### Administration du tenant

Les rôles `admin` et `manager` voient :

- le solde courant ;
- la consommation sur la période ;
- chaque création ou utilisation avec auteur, date, catégorie, quantité et crédits ;
- les réservations remboursées et les corrections ;
- des filtres par utilisateur, catégorie, période et statut.

Ils ne voient ni les coûts fournisseurs, ni la marge interne, ni les prix spécifiques des autres tenants.

### Membres

Un membre voit le solde disponible du tenant et ses propres consommations. Il ne voit ni la consommation nominative des autres membres, ni les coûts, ni les marges. Cette visibilité n'accorde aucun droit d'écriture sur le portefeuille ou le ledger.

## Sécurité et audit

- Les tables de politique et d'économie restent privées, accessibles en écriture uniquement par les fonctions de service contrôlées.
- Les lectures tenant respectent l'appartenance et le rôle ; les lectures personnelles filtrent sur `auth.uid()`.
- Le ledger reste immuable et toute correction est une nouvelle écriture compensatrice.
- Chaque modification de politique, suspension, prix, coût ou taux de change conserve acteur, motif, date et version.
- Une divergence entre portefeuille et ledger bloque l'usage et remonte une alerte exploitable.

## Migration et mise en service

1. Créer et amorcer le barème global versionné.
2. Découpler le débit de crédits de la valorisation économique.
3. Initialiser les contrôles manquants de tous les tenants sans modifier leurs soldes.
4. Ajouter l'initialisation transactionnelle aux créations futures.
5. Déployer les vues de consommation super-administrateur, administrateur de tenant et membre.
6. Activer Human Yo Impact, exécuter un usage réel puis vérifier le débit, l'auteur, le détail et l'éventuel statut économique.
7. Rejouer le même usage avec la même clé d'idempotence et prouver l'absence de double débit.
8. Simuler une panne fournisseur et prouver le remboursement intégral.
9. Exécuter le contrôle qualité complet et la recette navigateur sur le SHA déployé.

## Critères de clôture

- Aucun tenant actif ne possède de portefeuille affiché mais inerte.
- Toute unité facturable dispose d'un barème global actif et versionné.
- Un membre de Human Yo Impact peut provoquer un usage réel qui minore exactement le solde une fois.
- L'administrateur de Human Yo Impact retrouve cet usage avec son auteur et son détail.
- Le super-administrateur retrouve le même usage, sa valorisation ou la cause explicite de sa non-valorisation.
- La cible de 95 % produit une alerte sous le seuil sans modifier automatiquement le prix à la valeur.
- Les tests couvrent concurrence, idempotence, remboursement, héritage global, dérogation tenant, isolation et visibilité par rôle.
- Formatage, TypeScript, lint, tests, build et parcours Playwright sont verts au SHA exact déployé.
