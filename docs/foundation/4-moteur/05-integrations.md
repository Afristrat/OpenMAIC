# 05 — Intégrations · Chantier 4 — MOTEUR

> **Fil conducteur** — S'ajoute aux tableaux 0-3. Le runtime Qalem n'a aucune dépendance externe nouvelle : il consomme une publication versionnée. Seul le build de publication lira la future source Git privée.

| Service / dépendance | Usage | Clé/compte | Coût/limites | Criticité | Repli |
|---|---|---|---|---|---|
| Corpus OneDrive `formations skill\` | Source historique inventoriée, non canonique depuis V-01 | compte OneDrive d'Amine | hors Git, hors preuve de version | Lecture seule | Inventaire S4-001 |
| `~/.claude/skills/formation-design-pro/` | Copie installée historique, non canonique | — | divergence prouvée par S4-001 | Lecture seule | Inventaire S4-001 |
| Interface `lib/skills/` (base portée) | Canal de consommation plateforme | — (code interne) | dette `Skill.name` connue | Câblage = S1-001 (chantier 1) | — |
| Source Git privée du moteur | Source canonique future, externe au dépôt Qalem | accès de build à moindre privilège, non défini à V-01 | indisponibilité du build, aucun impact sur le runtime déjà publié | Build uniquement | dernière publication Qalem validée |

## Règles

1. **Zéro service externe au runtime** pour servir le savoir : pas de CMS ni de base vectorielle. Le futur Git privé intervient uniquement au build de publication.
2. La frontière Mnemo reste celle du CLAUDE.md global : le SAVOIR décisionnel du chantier (vecteurs validés, verdicts) se stocke dans le cercle Mnemo du projet ; le CONTENU andragogique vit dans le repo — pas de duplication.
3. Si un vecteur propose un embedding/RAG du corpus (croisement possible avec la base mémorielle bicéphale d'Amine — contrat d'interface `[EN ATTENTE]`) : la dépendance s'évalue à CE moment-là, contre ce tableau.
