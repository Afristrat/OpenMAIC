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

Une politique globale versionnée définit l'ancrage économique du crédit, les unités et les taux de consommation par défaut. Elle s'applique à tous les tenants. Une dérogation versionnée par tenant reste possible depuis le cockpit central.

Le barème initial arbitraire est écarté. Il aurait notamment facturé une seconde de vidéo comme un crédit sans aucune relation démontrée avec les ressources consommées. Le premier barème doit être calculé à partir de mesures réelles, puis arrondi en unités compréhensibles et gelé dans une version de politique.

L'ancrage recommandé est **1 crédit = 0,01 USD de capacité de coût interne de référence**. Il ne constitue ni une monnaie, ni une créance remboursable, ni le prix de vente d'un crédit. Il permet seulement de rendre comparables les jetons, les images, la voix, la vidéo, le stockage et les outils. Le prix commercial implicite d'un crédit reste propre au contrat du tenant : prix vendu divisé par crédits alloués.

Pour les usages variables mesurables, le règlement convertit le coût complet réellement observé en microunités de crédit : fournisseur payé, amortissement et électricité des ressources souveraines, infrastructure directement attribuable et stockage. Le percentile 95 sert au plafond réservé avant l'appel et aux unités forfaitaires qui ne remontent pas de coût exact ; il n'est pas utilisé pour surfacturer silencieusement le règlement réel. Une révision planifiée recalcule les plafonds et les forfaits recommandés, mais ne modifie jamais une version active automatiquement. Une variation significative produit une proposition et une alerte soumises au super-administrateur. Chaque usage conserve la version et le snapshot économique appliqués, ce qui rend les débits historiques stables et auditables.

Le barème exprime ainsi une capacité de consommation du produit adossée à une mesure économique, tandis que le prix de vente demeure fondé sur la valeur. Il ne sert pas à calculer automatiquement ce prix.

### Calibration mesurée le 23 septembre 2026

Une recette complète de production au SHA `89d789ebe0e7c5ff9ce2735011ac8c48e64a268e` a généré cinq scènes, 37 segments vocaux, un quiz, un classeur et un MP4 de 450,50 secondes. Elle a été exécutée sur un tenant éphémère puis intégralement nettoyée.

LiteLLM attribue exactement 0,243215994 USD au parcours :

| Ressource payée | Appels | Jetons | Coût |
|---|---:|---:|---:|
| DeepSeek V4 Pro | 19 | 93 170 | 0,160924544 USD |
| Gemini 3.1 Flash Image | 1 | 1 744 | 0,068574500 USD |
| Kimi K2.6 | 2 | 13 556 | 0,013716950 USD |
| **Total LiteLLM** | **22** | **108 470** | **0,243215994 USD** |

La synthèse vocale a produit environ 447,08 secondes d'audio en environ 552 secondes écoulées sur le DGX. Elle est aujourd'hui comptabilisée à zéro par LiteLLM, ce qui est une absence de valorisation et non un coût nul. Au prix public de référence de 4 699 USD amorti sur trois ans, l'occupation exclusive de 9,2 minutes représente environ 0,027 USD si le DGX est utilisé en permanence, ou 0,116 USD sur une hypothèse de 2 080 heures productives par an, avant électricité. Le coût complet provisoire de ce parcours se situe donc entre 0,270 et 0,359 USD, hors stockage et infrastructure partagée. Avec l'ancrage recommandé, il consommerait provisoirement entre 27 et 36 crédits. Cette fourchette doit être remplacée par le coût mesuré au compteur électrique et par une règle d'allocation de la capacité partagée avant amorçage du barème.

La cible de marge brute de 95 % donnerait un plancher économique indicatif de 5,40 à 7,18 USD pour ce parcours. Ce plancher reste une alerte de viabilité et ne devient jamais le prix proposé au tenant.

### Étalonnage du modèle souverain

Le service direct `Qwen/Qwen3.8-27B-FP8` du premier DGX a été mesuré avec 240 jetons de sortie : 8,32 jetons/s sur une entrée courte, 7,87 jetons/s sur 3 904 jetons d'entrée et 6,80 jetons/s sur 14 464 jetons d'entrée. À quatre requêtes simultanées, deux réponses sortent à environ 8,3 jetons/s et deux à environ 4,15 jetons/s. Le champ de puissance NVIDIA est passé d'environ 12 W au repos à 26-28 W en charge soutenue, avec un pic à 42 W ; il ne représente pas la consommation murale complète.

À débit identique de 7,87 jetons/s, un million de jetons de sortie occupe environ 35,30 heures. Les [tarifs publiés par Runpod](https://www.runpod.io/pricing) pour des cartes de 48 Gio donnent un équivalent locatif de 17,30 USD sur A40 à 38,48 USD sur L40S par million de jetons de sortie. Cette comparaison est une enveloppe de location, pas un benchmark d'égalité de performance entre architectures.

Avec le [prix public NVIDIA de 4 699 USD](https://marketplace.nvidia.com/en-us/enterprise/personal-ai-supercomputers/dgx-spark/) amorti sur trois ans, le même million de jetons porte environ 6,31 USD d'amortissement si le DGX est utilisé en permanence, ou 26,58 USD avec 2 080 heures productives par an, avant électricité. Au [tarif professionnel ONEE](https://www.one.org.ma/FR/pages/interne.asp?id1=2&id2=35&id3=119&t2=1&t3=1) supérieur à 500 kWh, la [borne théorique de 140 W du GB10](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) représente environ 8,28 MAD d'électricité par million de jetons ; seule une prise mesurée permettra de remplacer cette borne par le coût réel.

Deux anomalies interdisent encore une automatisation fiable du coût local : l'alias LiteLLM `qwen3-14b-local` ne pointe pas vers ce service 27B mesuré, et `qwen2.5-14b-local` est publié dans le catalogue de la clé Qalem alors que le proxy le rejette. Le registre dynamique des modèles doit donc vérifier une inférence réelle et identifier le déploiement physique avant d'accepter un coût nul ou un modèle comme disponible.

### Prix à la valeur

Le prix vendu reste saisi par tenant, unité, devise, date d'effet et justification commerciale. Aucune fonction ne calcule ce prix à partir du coût ou de la cible de marge.

### Coûts fournisseurs

Les coûts sont versionnés par fournisseur, modèle, unité et devise. Leur actualisation peut être automatisée par une tâche planifiée lorsque la source est fiable. Une donnée absente ou périmée doit être signalée, jamais remplacée silencieusement par zéro.

### Marge

La marge est calculée uniquement lorsque prix, coût et conversion sont disponibles. La cible globale par défaut est 95 %. Une marge inférieure déclenche une alerte et un diagnostic. Elle ne modifie automatiquement ni le prix, ni le barème de crédits, ni les droits du tenant.

Un usage débité mais non valorisable porte explicitement le statut `pending_configuration`. Il apparaît dans le cockpit avec la cause exacte : prix absent, coût absent ou taux de change absent. Il est exclu du taux de marge calculé et inclus dans un compteur d'exposition non valorisée.

## Modèle de données

### Politique globale

Une table privée `platform_credit_policies` conserve l'ancrage d'un crédit, sa devise, sa date d'effet, sa méthode de calibration, sa justification et son auteur. Une table `platform_credit_burn_rates` conserve les règles globales liées à cette politique : unité, mode de règlement réel ou forfaitaire, plafond de réservation en microunités, base de quantité, percentile et fenêtre d'observation. Les versions sont immuables et leurs périodes ne peuvent pas se chevaucher.

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

1. Créer le modèle de politique global versionné sans amorcer de taux non mesuré.
2. Instrumenter et valoriser toutes les unités, y compris les DGX et l'infrastructure partagée, puis produire les plafonds de réservation et les forfaits au percentile 95 observé.
3. Découpler le débit de crédits de la valorisation économique.
4. Initialiser les contrôles manquants de tous les tenants sans modifier leurs soldes.
5. Ajouter l'initialisation transactionnelle aux créations futures.
6. Déployer les vues de consommation super-administrateur, administrateur de tenant et membre.
7. Activer Human Yo Impact, exécuter un usage réel puis vérifier le débit, l'auteur, le détail et l'éventuel statut économique.
8. Rejouer le même usage avec la même clé d'idempotence et prouver l'absence de double débit.
9. Simuler une panne fournisseur et prouver le remboursement intégral.
10. Exécuter le contrôle qualité complet et la recette navigateur sur le SHA déployé.

## Critères de clôture

- Aucun tenant actif ne possède de portefeuille affiché mais inerte.
- Toute unité facturable dispose d'un barème global actif, mesuré, versionné et relié à sa politique d'ancrage.
- Aucun coût souverain ou fournisseur absent ne peut être interprété comme nul ; les DGX disposent d'une valorisation d'amortissement, d'énergie et de capacité partagée.
- Un membre de Human Yo Impact peut provoquer un usage réel qui minore exactement le solde une fois.
- L'administrateur de Human Yo Impact retrouve cet usage avec son auteur et son détail.
- Le super-administrateur retrouve le même usage, sa valorisation ou la cause explicite de sa non-valorisation.
- La cible de 95 % produit une alerte sous le seuil sans modifier automatiquement le prix à la valeur.
- Les tests couvrent concurrence, idempotence, remboursement, héritage global, dérogation tenant, isolation et visibilité par rôle.
- Formatage, TypeScript, lint, tests, build et parcours Playwright sont verts au SHA exact déployé.
