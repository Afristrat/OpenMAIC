# 07 — Legal & compliance · Chantier 4 — MOTEUR

> **Fil conducteur** — Hérite du 0-SOCLE. Couche propre : propriété intellectuelle du corpus et frontière licence entre le savoir d'Amine et le code AGPL de la plateforme.

## 1. Propriété du corpus andragogique

- Le corpus formation-design-pro (méthodologies, templates, mega-prompts, adaptation culturelle) est l'ACTIF PROPRE d'Amine — antérieur et extérieur au fork OpenMAIC. Il ne doit JAMAIS être placé sous la licence du code par accident.
- **Garantie par construction (à confirmer au vecteur d'architecture S4-002)** : si le corpus canonique vit dans le repo Qalem (AGPL — cf. ADR-002 socle), le distinguer explicitement : répertoire dédié avec son propre fichier LICENSE (tous droits réservés / licence propriétaire d'Amine), exclu de l'obligation de mise à disposition AGPL ? ⚠️ **Point juridique réel** : l'AGPL §13 couvre le « Corresponding Source » du logiciel — des fichiers de DONNÉES/prompts chargés à l'exécution peuvent, selon leur couplage, être considérés comme partie du logiciel ou comme données indépendantes. À instruire sérieusement (sources juridiques, pas de mémoire) AVANT de committer le corpus dans le repo public-facing ; alternatives : corpus dans un repo privé séparé consommé au build/déploiement.
- Ce point est un ARGUMENT D'ARBITRAGE du vecteur S4-002 (où vit le corpus) — consigné ici pour qu'il ne soit pas oublié au moment de la tranche.

## 2. Sources tierces dans le corpus

- Les méthodologies citées (Knowles, ADDIE, Bloom, Kirkpatrick) sont des cadres conceptuels — libres d'usage ; les EXTRAITS d'ouvrages ou supports tiers éventuellement présents dans le corpus doivent être identifiés à l'inventaire (S4-001 : colonne « source tierce ? ») pour éviter toute redistribution non autorisée via la skill autonome.

## 3. Dettes assumées du chantier

| Dette | Pourquoi acceptable | Déclencheur |
|---|---|---|
| Qualification AGPL du corpus non instruite | Corpus pas encore dans le repo ; chantier non démarré | AVANT le commit du corpus canonique où qu'il soit (S4-002) |
| Inventaire des sources tierces non fait | Fait partie de S4-001 | S4-001 |
| Licence de distribution de la skill autonome non définie | Distribution externe = parking lot (décision business) | Si Amine décide de distribuer la skill hors de son poste |
