# Canevas d’import Qalem v1 — Proposition à co-valider

> Statut : **PROPOSITION** pour S1-002. Ce document ne déclenche aucun développement du pipeline d’import. Il devient `canevas-import-v1.md` seulement après validation explicite d’Amine et de Claude, consignée dans l’ADR-104.

## 1. Finalité et limites

Qalem ne promet pas de transformer un document quelconque en formation de qualité. Il accepte un contenu source déjà structuré pour devenir une expérience d’apprentissage adulte : une progression par problèmes, des objectifs observables, des activités ou contrôles de compréhension et une preuve d’application.

Le canevas sert à deux choses distinctes :

1. Donner au créateur un format simple à préparer.
2. Donner au validateur un contrat binaire et explicable avant toute génération d’outline, de scènes ou de quiz.

Les langues acceptées sont le français, l’arabe standard moderne et l’anglais. Les formats acceptés sont Markdown (`.md`), DOCX (`.docx`) et PDF contenant du texte sélectionnable (`.pdf`). Un PDF scanné ou une image de document ne relève pas de cette v1.

## 2. Structure logique obligatoire

Le support peut être écrit en Markdown, dans un document avec styles de titres, ou dans un PDF exporté depuis ce document. Sa structure logique doit rester identique.

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

## Chapitre 2 — [problème professionnel à résoudre]
… même structure …

## Preuve finale d’application
Livrable ou plan réellement utilisable après la formation, avec critères de réussite.
```

### Correspondance avec le pipeline Qalem

| Élément du canevas | Destination aval |
|---|---|
| Titre | Titre du course et de l’outline |
| Résultat professionnel visé | Promesse, objectif global et cadrage du directeur |
| Public et contexte | Niveau, langue et adaptation des exemples |
| Chapitre | Chapitre de l’outline puis groupe de scènes |
| Objectif observable | Critères de scènes, quiz et activité |
| Contenu essentiel | Source de slides, notes et exemples |
| Mise en pratique ou point de contrôle | Quiz, simulation, activité interactive ou débat |
| Preuve finale d’application | Évaluation authentique, pas simple QCM final |

## 3. Exemple minimal complet en français

```markdown
# Décider quelles tâches automatiser avec l’IA dans une PME

## Résultat professionnel visé
À la fin, chaque participant repart avec une priorisation justifiée de trois tâches à automatiser dans sa propre PME et un premier plan d’expérimentation sur deux semaines.

## Pour qui et dans quel contexte
Dirigeants et responsables opérationnels de PME marocaines, débutants en IA générative. Ils disposent d’outils bureautiques et d’un accès web ; leurs processus sont souvent documentés de façon incomplète.

## Chapitre 1 — Repérer une tâche qui mérite d’être automatisée
### Objectif observable
Cartographier une tâche récurrente de son équipe et identifier son coût, sa fréquence et son niveau de risque.
### Contenu essentiel
Une tâche devient candidate si elle est répétitive, assez stable, vérifiable et si une erreur coûte du temps ou de l’argent. Une automatisation ne convient pas à une décision sensible sans contrôle humain.
### Mise en pratique ou point de contrôle
À partir de la grille fournie, chaque participant analyse une tâche réelle. Puis il explique à un pair pourquoi elle est ou non une bonne candidate.

## Chapitre 2 — Choisir une première expérimentation à faible risque
### Objectif observable
Comparer trois tâches candidates avec une grille impact, faisabilité, risque et qualité des données.
### Contenu essentiel
Commencer par une expérimentation réversible. Mesurer un indicateur avant et après : temps de traitement, nombre d’erreurs ou délai de réponse. Prévoir un responsable humain et une procédure de retour arrière.
### Mise en pratique ou point de contrôle
Le participant classe ses trois tâches et défend son premier choix devant le groupe. Le groupe formule un risque à surveiller et une mesure de succès.

## Preuve finale d’application
Une fiche d’expérimentation d’une page : tâche choisie, propriétaire, scénario de test de deux semaines, indicateur de succès, risque principal et condition d’arrêt.
```

## 4. Règles de validation programmatiques

Les identifiants sont stables. Les messages sont les contrats affichés dans `validation_report`. Un même dépôt peut déclencher plusieurs écarts ; le verdict est `conform` seulement si aucun écart bloquant n’est présent.

| ID | Règle binaire | Contrôle programmatique | Écart et message exact |
|---|---|---|---|
| CI-01 | Le fichier est un `.md`, `.docx` ou `.pdf`. | Extension autorisée **et** type MIME cohérent avec l’extension. | « Règle CI-01 : Qalem accepte un fichier Markdown, DOCX ou PDF texte. Exportez votre contenu dans l’un de ces formats puis déposez-le à nouveau. » |
| CI-02 | Le fichier contient du texte extractible. | L’extracteur retourne au moins un caractère non blanc. | « Règle CI-02 : votre fichier ne contient pas de texte exploitable. Pour un PDF, exportez la version texte plutôt qu’une image ou un scan. » |
| CI-03 | La langue principale est FR, AR moderne ou EN. | Détection de langue avec confiance minimale définie dans le validateur ; sinon rejet. | « Règle CI-03 : Qalem n’identifie pas une langue prise en charge. Rédigez le contenu principalement en français, arabe standard moderne ou anglais. » |
| CI-04 | Un titre de formation unique est présent avant le premier chapitre. | Premier titre de niveau 1, ou style DOCX/PDF équivalent, non vide. | « Règle CI-04 : votre formation n’a pas de titre principal. Ajoutez un titre unique au début du document. » |
| CI-05 | Le résultat professionnel visé est présent. | Section normalisée `Résultat professionnel visé` ou équivalent localisé, avec texte non vide. | « Règle CI-05 : indiquez le résultat professionnel visé. Décrivez ce que la personne pourra produire, décider ou améliorer à l’issue de la formation. » |
| CI-06 | Le public et le contexte sont présents. | Section normalisée `Pour qui et dans quel contexte` ou équivalent localisé, avec texte non vide. | « Règle CI-06 : précisez le public, son niveau de départ et son contexte de travail. Qalem les utilise pour adapter les exemples et les activités. » |
| CI-07 | Le document contient au moins un chapitre. | Au moins un titre de niveau 2 commençant par `Chapitre` ou identifié comme chapitre dans le style DOCX/PDF. | « Règle CI-07 : aucun chapitre n’a été trouvé. Ajoutez des titres de niveau 2 : ils deviennent les chapitres de votre formation. » |
| CI-08 | Chaque chapitre possède un objectif observable. | Chaque chapitre contient une sous-section `Objectif observable` non vide avant le chapitre suivant. | « Règle CI-08 : le chapitre « {chapterTitle} » n’a pas d’objectif observable. Ajoutez une action vérifiable, par exemple une décision, un livrable ou un comportement. » |
| CI-09 | Chaque chapitre possède un contenu essentiel. | Chaque chapitre contient une sous-section `Contenu essentiel` non vide. | « Règle CI-09 : le chapitre « {chapterTitle} » ne contient pas le matériau à transformer. Ajoutez les méthodes, explications, exemples ou ressources indispensables. » |
| CI-10 | Chaque chapitre possède une mise en pratique ou un contrôle. | Chaque chapitre contient une sous-section `Mise en pratique ou point de contrôle` non vide. | « Règle CI-10 : le chapitre « {chapterTitle} » n’a pas de mise en pratique ni de point de contrôle. Ajoutez un exercice, une décision, une question ou une production. » |
| CI-11 | Une preuve finale d’application est présente. | Section normalisée `Preuve finale d’application` non vide. | « Règle CI-11 : ajoutez une preuve finale d’application. Elle doit décrire un livrable ou un plan que la personne pourra réellement utiliser. » |
| CI-12 | Le contenu ne contient pas de données personnelles de tiers. | Le dépôt exige une attestation explicite du déposant. Le validateur bloque les motifs déterministes à haut risque : e-mail, téléphone et identifiant national. Il ne prétend pas détecter de manière fiable tous les noms de personnes ; les motifs détectés sont retournés sans réafficher la donnée. | « Règle CI-12 : le document semble contenir des données personnelles de tiers. Retirez ou anonymisez-les avant l’import ; Qalem ne doit pas transformer ces données. » |
| CI-13 | La structure est hiérarchique et non plate. | Aucun chapitre sans sous-section requise ; aucun titre de niveau 3 requis hors chapitre. | « Règle CI-13 : la hiérarchie du document est incohérente. Placez chaque objectif, contenu et activité sous le chapitre concerné. » |

### Équivalents localisés autorisés

Le validateur accepte les libellés ci-dessous après normalisation Unicode, retrait des espaces superflus et comparaison insensible à la casse. Les titres de contenu restent dans la langue choisie ; seuls les libellés structurels sont contrôlés.

| Élément | Français | Arabe standard moderne | Anglais |
|---|---|---|---|
| Résultat professionnel visé | `Résultat professionnel visé` | `النتيجة المهنية المستهدفة` | `Target professional outcome` |
| Public et contexte | `Pour qui et dans quel contexte` | `الفئة المستهدفة والسياق` | `Audience and context` |
| Chapitre | `Chapitre` | `الفصل` | `Chapter` |
| Objectif | `Objectif observable` | `هدف قابل للملاحظة` | `Observable objective` |
| Contenu | `Contenu essentiel` | `المحتوى الأساسي` | `Essential content` |
| Pratique / contrôle | `Mise en pratique ou point de contrôle` | `تطبيق عملي أو نقطة تحقق` | `Practice or checkpoint` |
| Preuve finale | `Preuve finale d’application` | `دليل التطبيق النهائي` | `Final application evidence` |

## 5. Convention par format

### Markdown

Le document utilise un seul `#` pour le titre, `##` pour les sections et chapitres, puis `###` pour les trois sous-sections de chaque chapitre. Le Markdown est la référence de test : DOCX et PDF sont normalisés vers cette hiérarchie logique avant validation.

### DOCX

Le titre de formation doit utiliser le style `Titre 1`. Les sections et chapitres utilisent `Titre 2`. Les objectifs, contenu et pratique utilisent `Titre 3`. Une mise en forme visuelle manuelle sans styles de titres n’est pas un substitut acceptable : elle ne donne pas une structure fiable au validateur.

### PDF texte

Le PDF doit être exporté depuis un document structuré. Les titres doivent être détectables à partir de l’ordre de lecture et de la hiérarchie extraite. Un PDF dont la hiérarchie ne peut pas être reconstituée est rejeté avec CI-13, même si son texte est lisible.

## 6. Contrat de sortie du validateur

```json
{
  "canvasVersion": "v1",
  "status": "conform | rejected",
  "language": "fr-FR | ar-MA | en-US",
  "issues": [
    {
      "rule": "CI-10",
      "path": "Chapitre 2",
      "message": "Règle CI-10 : le chapitre « … » n’a pas de mise en pratique ni de point de contrôle. Ajoutez un exercice, une décision, une question ou une production."
    }
  ],
  "outlinePreview": {
    "title": "…",
    "chapters": ["…"]
  }
}
```

`outlinePreview` n’est produit que si le canevas est `conform`. Le stockage du fichier, les droits, la conservation et le mapping effectif vers l’Editor relèvent respectivement de S1-003 et S1-005.

## 7. Décisions laissées ouvertes à Amine

Ces choix ne doivent pas être déguisés en règles techniques dans S1-003 :

1. **Taille maximale de fichier** : proposition de départ 25 Mo, à arbitrer selon les besoins DOCX/PDF et les limites d’infrastructure.
2. **Nombre minimal de chapitres** : proposition de départ 1 afin d’autoriser un atelier court ; décider si le catalogue doit imposer 2 ou plus.
3. **Données personnelles et noms dans les cas publics** : le v1 exige une attestation du déposant et bloque les motifs explicites à haut risque. Les noms ne sont pas détectables de façon fiable par règle déterministe ; décider si un nom repéré dans un contrôle ultérieur doit déclencher un avertissement, un rejet ou une revue humaine.
4. **Langues mixtes** : proposition de départ : une langue principale admise, termes techniques et citations brèves dans une autre langue tolérés. Décider si une formation réellement bilingue doit être une capacité v1.
5. **Formats supplémentaires** : proposition de départ : aucun. PPTX, URL, Notion, Google Docs, LMS/SCORM et PDF scannés restent hors canevas v1 tant qu’un contrat de structure et une preuve de qualité ne sont pas définis.
6. **Droits et rétention** : avant l’ouverture publique de `import_pipeline`, les CGU doivent recueillir la garantie de droits du déposant et la politique de conservation doit fixer une durée et la suppression.

## 8. Checklist de co-validation S1-002

- [ ] La promesse de qualité est mieux protégée par ce canevas que par un import libre.
- [ ] Chaque règle CI-01 à CI-13 est testable sans jugement de modèle ; CI-12 ne prétend pas garantir l’absence universelle de données personnelles.
- [ ] Les messages de rejet restent précis, utiles et non punitifs.
- [ ] L’exemple minimal est assez simple pour un créateur non technique.
- [ ] Les six décisions ouvertes ont une réponse explicite.
- [ ] Amine et Claude datent la validation ; seulement alors le document est renommé et S1-003 peut démarrer.
