# Inventaire prouvé du corpus Formation Design Pro

Date de constat : 2026-07-18  
Story : S4-001  
Nature : photographie factuelle en lecture seule des sources ; aucune proposition d’architecture.

## 1. Périmètres examinés

| Périmètre | Rôle déclaré | Fichiers | Octets | Markdown | Python |
|---|---|---:|---:|---:|---:|
| `C:\Users\amans\OneDrive\formations skill\` | Source maître déclarée | 65 | 1 670 416 | 49 | 4 |
| `C:\Users\amans\.claude\skills\formation-design-pro\` | Copie installée Claude | 35 | 644 858 | 32 | 2 |
| `C:\Users\amans\.agents\skills\formation-design-pro\` | Copie installée Agents/Codex | 35 | 644 857 | 32 | 2 |
| `C:\projets\Qalem\DIAGNOSTIC-formation-design-pro.md` | Diagnostic transmis | 1 | 7 884 | 1 | 0 |
| `C:\projets\Qalem\refork-v030-wt\skills\formation-design-pro\` | Consommateur Qalem actuel | 2 | non agrégé ici | 1 | 0 |

Comptage et tailles obtenus par énumération système au moment du constat. Les empreintes utilisées pour les comparaisons sont des SHA-256 calculées fichier par fichier.

## 2. État de synchronisation

### 2.1 Source maître vers copies installées

Le sous-dossier `formation-design-pro/` de la source maître contient exactement les 35 chemins présents dans la copie `.claude`.

- 35/35 chemins de la source maître sont présents dans `.claude`.
- 35/35 fichiers ont la même empreinte SHA-256.
- La copie `.claude` est donc une reproduction exacte du sous-dossier maître au moment du constat.

La copie `.agents` correspond également au sous-dossier maître pour 34 fichiers sur 35. Seul `SKILL.md` diffère :

| Copie | Taille | SHA-256 |
|---|---:|---|
| Source maître | 43 495 | `E74A420B05A8BE43AC60C030DB50AE1EE6D6D57DCD937324CC6BC08201EE3340` |
| `.claude` | 43 495 | `E74A420B05A8BE43AC60C030DB50AE1EE6D6D57DCD937324CC6BC08201EE3340` |
| `.agents` | 43 494 | `6707F6A7C84D9A8BA6D6DC66F1F8B33B610C0FDFE79CA7E4A3BE9471CD5575B3` |

L’écart est d’un octet. Son contenu sémantique n’est pas encore qualifié dans cette story.

### 2.2 Contenu supplémentaire de la source maître

La source maître contient 30 fichiers hors du sous-dossier unifié :

- 9 documents et fichiers de contrôle à la racine (`CLAUDE.md`, guides, crédits, proposition d’unification, README, `.gitignore`, configuration locale) ;
- 3 archives `.skill` et 3 archives ou copies `.zip` ;
- 5 fichiers dans `formation-architect/` ;
- 5 fichiers dans `formation-engineering/` ;
- 5 autres artefacts historiques ou packagés.

Deux paires sont des doublons binaires exacts :

- `formation-architect.skill` = `formation-architect.zip` ;
- `formation-design-pro-v2.0.skill` = `formation-design-pro-v2.0.zip` ;
- `formation-engineering.skill` = `formation-engineering.zip`.

## 3. Doublons internes prouvés

Les paires suivantes ont une empreinte SHA-256 identique :

| Canon visible | Doublon dans `maj/` |
|---|---|
| `core/andragogy-knowles.md` | `maj/andragogy-knowles.md` |
| `core/diagnostic-pedagogie-andragogie.md` | `maj/diagnostic-pedagogie-andragogie.md` |
| `assessment/checklist-andragogique.md` | `maj/checklist-andragogique.md` |
| `core/pedagogical-frameworks-updated.md` | `maj/pedagogical-frameworks.md` |

`core/pedagogical-frameworks.md` et `core/pedagogical-frameworks-updated.md` ne sont pas identiques : 8 829 octets contre 17 608 octets, avec des empreintes différentes.

## 4. Inventaire des familles de fichiers et provenance tierce

La colonne « Source tierce ? » décrit uniquement ce qui est démontrable dans les fichiers lus. « Non établie » signifie qu’aucune chaîne de provenance complète n’a été trouvée ; cela ne signifie ni « propriétaire » ni « libre de droits ».

| Fichier ou groupe exhaustif | Rôle constaté | Source tierce ? |
|---|---|---|
| `SKILL.md` | Routeur principal, modes, règles et exemples | Mixte déclaré : auteur Amine ; frameworks tiers cités ; provenance phrase par phrase non établie |
| `core/andragogy-knowles.md` et doublon `maj/` | Synthèse des principes attribués à Knowles | Oui, framework tiers cité ; source exacte et droits de la rédaction non établis |
| `core/addie-complete.md` | Méthode ADDIE | Oui, framework tiers ; source exacte de la rédaction non établie |
| `core/pedagogical-frameworks.md` | ADDIE, Bloom, Kirkpatrick, 70-20-10, charge cognitive | Oui, plusieurs frameworks tiers ; provenance détaillée non établie |
| `core/pedagogical-frameworks-updated.md` et `maj/pedagogical-frameworks.md` | Version enrichie des frameworks | Oui, plusieurs frameworks tiers ; provenance détaillée non établie |
| `core/diagnostic-pedagogie-andragogie.md` et doublon `maj/` | Grille de diagnostic notée | Non établie |
| `core/andragogy-integration.md` | Règles d’intégration | Non établie |
| `assessment/checklist-andragogique.md` et doublon `maj/` | Checklist notée | Non établie |
| `assessment/practical-evaluation.md` | Modèle d’évaluation pratique | Non établie |
| `assessment/project-rubric.md` | Grille de projet | Non établie |
| `assessment/quiz-template.md` | Modèle de quiz | Non établie |
| `automation/generate_formation_structure.py` | Génération déterministe d’une structure | Auteur/licence non indiqués dans l’inventaire |
| `automation/generate_learning_objectives.py` | Génération d’objectifs et score de charge | Auteur/licence non indiqués dans l’inventaire |
| `automation/README.md` | Documentation des scripts | Non établie |
| `adaptation/use-case-library.md` | Cas Maroc/Afrique | Non établie ; faits et entreprises externes présents |
| `delivery/facilitator-guide.md` | Guide formateur | Non établie |
| `delivery/learner-guide.md` | Guide apprenant | Non établie |
| `formats/hybrid-learning.md` | Format hybride | Non établie ; concepts externes présents |
| `formats/innovative-formats.md` | Formats de formation | Non établie ; concepts externes présents |
| `formats/online-learning.md` | Format en ligne | Non établie ; concepts externes présents |
| `prompts/mega-prompts.md` | Bibliothèque de prompts | Non établie |
| `prompts/prompts-engineering.md` | Bibliothèque de prompts spécialisée | Non établie |
| `templates/modules/detailed.md` | Modèle de module détaillé | Non établie |
| `templates/modules/quick.md` | Modèle de module court | Non établie |
| `templates/syllabus/complete.md` | Modèle de syllabus | Non établie |
| `workflows/adapt-existing.md` | Workflow d’adaptation | Non établie |
| `workflows/complete-program-40h.md` | Workflow programme long | Non établie |
| `workflows/generate-use-cases.md` | Workflow cas d’usage | Non établie |
| `workflows/quick-module-3h.md` | Workflow module court | Non établie |
| `maj/README.md` | Instructions de mise à jour | Non établie |
| `.claude/settings.local.json` | Configuration locale d’une session | Sans objet pour le savoir métier |
| `formation-architect/**` | Ancêtre architecture/automatisation | Auteur Amine déclaré ; frameworks tiers cités ; provenance détaillée non établie |
| `formation-engineering/**` | Ancêtre ingénierie/templates | Auteur Amine déclaré ; frameworks tiers cités ; provenance détaillée non établie |
| Guides et README racine | Documentation d’utilisation et d’unification | Auteur Amine déclaré ; provenance détaillée non établie |
| Archives `.skill` et `.zip` | Paquetages binaires des sources | Héritent de la provenance des fichiers embarqués |

## 5. État du consommateur Qalem

Le consommateur actuel est constitué de :

- `skills/formation-design-pro/manifest.json` ;
- `skills/formation-design-pro/prompts/andragogy-system-override.md`.

Le manifeste contient trois agents, trois overrides de prompts et quatre templates de classroom. Il encode comme contraintes absolues plusieurs ratios également présents dans le corpus : 30/70, 20 % de pair learning, 50–60 % de cas Maroc/Afrique, niveaux Bloom élevés et nombre maximal de concepts. La story S1-001 qui doit brancher les overrides dans la génération est encore marquée `passes: false` dans `.ralph/prd-v2.json` au moment du constat.

## 6. Constats déjà établis par le diagnostic transmis

Le diagnostic du 2026-07-09 relève notamment :

- l’absence d’instruments opérationnels de preuve d’impact différée ;
- l’absence de stratégie linguistique FR/AR/darija et d’inclusion ;
- l’absence de l’IA comme modalité de formation ;
- l’absence d’évaluations automatisées de la skill ;
- la longueur de 1 238 lignes du `SKILL.md` ;
- les doublons `maj/` et les versions divergentes des frameworks ;
- la double maintenance non outillée.

Ces éléments sont consignés comme constats du diagnostic, sans adoption automatique de son plan de refonte.

## 7. Limites de cette photographie

- La présence d’un nom de framework ne prouve ni l’exactitude de son interprétation ni le droit de réutiliser la rédaction.
- Les archives binaires ont été inventoriées par empreinte et taille ; leur contenu n’a pas été traité comme une quatrième source autonome lorsque leur empreinte correspond à un paquetage déjà identifié.
- L’opérationnalité des scripts et la qualité des sorties ne sont pas certifiées par cet inventaire documentaire.
- L’inventaire LiteLLM et les modèles ComfyUI relèvent du futur banc de capacités ; ils ne font pas partie du corpus andragogique décrit ici.
