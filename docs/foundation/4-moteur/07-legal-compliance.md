# 07 — Legal & compliance · Chantier 4 — MOTEUR

> **Fil conducteur** — Hérite du 0-SOCLE. Couche propre : propriété intellectuelle du corpus et frontière de publication entre le savoir d'Amine et le dépôt de la plateforme.

## 1. Propriété du corpus andragogique

- Le corpus formation-design-pro (méthodologies, templates, mega-prompts, adaptation culturelle) est l'ACTIF PROPRE d'Amine — antérieur et extérieur au fork OpenMAIC. Il ne doit JAMAIS être placé sous la licence du code par accident.
- **État vérifié le 2026-07-21** : le dépôt GitHub est public et détecté MIT ; `LICENSE` et `package.json` déclarent MIT. La qualification AGPL de cette branche était une information périmée. S0-014 suit séparément 35 fichiers à provenance AGPL potentielle avant la fermeture commerciale du code.
- **Garantie par construction retenue par V-01** : le corpus canonique ne vit jamais dans ce dépôt. Une source Git privée externe alimentera uniquement des publications compilées et tracées. `11-publication-boundary.md` décrit le contrôle exécutable. La licence commerciale future du corpus reste une décision juridique et business hors ADR-404.
- Ce point est un ARGUMENT D'ARBITRAGE du vecteur S4-002 (où vit le corpus) — consigné ici pour qu'il ne soit pas oublié au moment de la tranche.

## 2. Sources tierces dans le corpus

- Les méthodologies citées (Knowles, ADDIE, Bloom, Kirkpatrick) sont des cadres conceptuels — libres d'usage ; les EXTRAITS d'ouvrages ou supports tiers éventuellement présents dans le corpus doivent être identifiés à l'inventaire (S4-001 : colonne « source tierce ? ») pour éviter toute redistribution non autorisée via la skill autonome.

## 3. Dettes assumées du chantier

| Dette | Pourquoi acceptable | Déclencheur |
|---|---|---|
| Licence commerciale du corpus non instruite | V-01 interdit sa publication dans Qalem ; aucune nouvelle licence n'est nécessaire pour poser cette frontière | Avant toute distribution externe d'une publication issue du corpus |
| Inventaire des sources tierces non fait | Fait partie de S4-001 | S4-001 |
| Licence de distribution de la skill autonome non définie | Distribution externe = parking lot (décision business) | Si Amine décide de distribuer la skill hors de son poste |
