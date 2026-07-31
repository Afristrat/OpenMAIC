# Canevas d’import Qalem v1

> Statut : **ACTÉ le 31 juillet 2026** dans le cadre du mandat d’autonomie du propriétaire du produit. Ce document est le contrat normatif de S1-003 et remplace la proposition associée, qui demeure l’historique de conception.

## Décisions v1

1. Taille maximale : **25 Mo**.
2. Une formation comporte au moins **un chapitre**.
3. Une langue principale est exigée : français, arabe standard moderne ou anglais. Les termes techniques et citations brèves dans une autre langue sont admis.
4. Seuls Markdown, DOCX et PDF texte sont acceptés. Les autres formats, URL et PDF scannés restent hors v1.
5. Le déposant atteste disposer des droits nécessaires. Les données personnelles de tiers doivent être retirées ou anonymisées.
6. La conservation et la suppression du fichier sont soumises à la politique applicable de Qalem avant l’ouverture publique du flux d’import.

## Structure obligatoire

```text
Titre de la formation

## Résultat professionnel visé
Une phrase : ce que la personne saura produire, décider ou améliorer dans son contexte réel.

## Pour qui et dans quel contexte
Public adulte, niveau de départ, contexte métier ou organisationnel, prérequis éventuels.

## Chapitre 1 — [problème professionnel à résoudre]
### Objectif observable
Verbe d’action + livrable, décision ou comportement vérifiable.
### Contenu essentiel
Explications, méthodes, exemples et ressources nécessaires.
### Mise en pratique ou point de contrôle
Exercice, étude de cas, question de décision, production ou auto-évaluation.

## Preuve finale d’application
Livrable ou plan réellement utilisable après la formation, avec critères de réussite.
```

## Règles programmatiques

| ID | Règle |
|---|---|
| CI-01 | Le fichier est un Markdown, DOCX ou PDF texte dont le type MIME correspond à l’extension. |
| CI-02 | Le fichier contient du texte extractible. |
| CI-03 | La langue principale est le français, l’arabe standard moderne ou l’anglais. |
| CI-04 | Un titre principal unique est présent avant le premier chapitre. |
| CI-05 | La section « Résultat professionnel visé » est présente et non vide. |
| CI-06 | La section « Pour qui et dans quel contexte » est présente et non vide. |
| CI-07 | Au moins un chapitre est présent. |
| CI-08 | Chaque chapitre contient un objectif observable non vide. |
| CI-09 | Chaque chapitre contient un contenu essentiel non vide. |
| CI-10 | Chaque chapitre contient une mise en pratique ou un point de contrôle non vide. |
| CI-11 | Une preuve finale d’application non vide est présente. |
| CI-12 | Le déposant atteste les droits nécessaires ; les motifs déterministes à haut risque de données personnelles de tiers sont rejetés sans réafficher la donnée. |
| CI-13 | La hiérarchie est cohérente : les sections requises sont situées sous leur chapitre. |

Chaque écart produit un diagnostic actionnable : il cite la règle concernée et indique l’action de correction, sans ton punitif. Le contrat détaillé, les équivalents FR/AR/EN et l’exemple complet restent documentés dans `canevas-import-v1-PROPOSITION.md`, adopté comme annexe normative de cette version.

## Validation

- Propriétaire du produit : mandat d’autonomie explicite du 31 juillet 2026.
- Architecture et contrôles : Codex.
- Portée : v1 uniquement ; toute extension de format ou de règle crée une nouvelle décision versionnée.
