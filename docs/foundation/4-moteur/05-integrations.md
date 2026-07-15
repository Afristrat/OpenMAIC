# 05 — Intégrations · Chantier 4 — MOTEUR

> **Fil conducteur** — S'ajoute aux tableaux 0-3 (non recopiés). Le moteur n'a AUCUNE dépendance externe nouvelle : c'est sa force (un savoir en fichiers versionnés ne tombe pas en panne).

| Service / dépendance | Usage | Clé/compte | Coût/limites | Criticité | Repli |
|---|---|---|---|---|---|
| Corpus OneDrive `formations skill\` | Source maître actuelle (statut à trancher au vecteur d'architecture S4-002) | compte OneDrive d'Amine | ⚠️ hors git, hors preuve de version | Lecture seule jusqu'à S4-002 | L'inventaire S4-001 en fait une copie horodatée AVANT toute décision |
| `~/.claude/skills/formation-design-pro/` | Copie installée (consommée par Claude Code aujourd'hui) | — | divergence possible avec le maître (à mesurer S4-001) | Lecture seule (session home propriétaire) | — |
| Interface `lib/skills/` (base portée) | Canal de consommation plateforme | — (code interne) | dette `Skill.name` connue | Câblage = S1-001 (chantier 1) | — |

## Règles

1. **Zéro service externe** pour héberger/servir le savoir (pas de CMS, pas de base vectorielle) tant qu'aucun vecteur validé ne le justifie — le git du repo suffit à la revue vecteur par vecteur.
2. La frontière Mnemo reste celle du CLAUDE.md global : le SAVOIR décisionnel du chantier (vecteurs validés, verdicts) se stocke dans le cercle Mnemo du projet ; le CONTENU andragogique vit dans le repo — pas de duplication.
3. Si un vecteur propose un embedding/RAG du corpus (croisement possible avec la base mémorielle bicéphale d'Amine — contrat d'interface `[EN ATTENTE]`) : la dépendance s'évalue à CE moment-là, contre ce tableau.
