# 10 — Execution prompts · Chantier 0 — SOCLE

> **Fil conducteur** — Prompts EXACTS pour exécutants qui n'ont NI le CLAUDE.md NI les autres documents : chaque prompt embarque tout son contexte. Ici : les children Ralph `claude -p` du portage (isolés en worktree, contexte vierge). Les chantiers 1-3 auront leurs propres prompts (Stitch/UI au 1-2, etc.).

## P0-A — Prompt child Ralph : story de portage type (S0-002 à S0-007)

Gabarit à instancier par story (remplacer `{{STORY_ID}}`, `{{STORY_TITRE}}`, `{{CRITERE}}`) :

```text
Tu es un agent d'exécution sur le repo Qalem (fork d'OpenMAIC), branche refork-v030,
dans un git worktree isolé. Gestionnaire : pnpm (monorepo workspaces).

CONTEXTE : nous portons nos personnalisations depuis l'ancien fork (branche main,
figée, LECTURE SEULE — appelée « la carrière ») vers une base neuve issue de
l'upstream v0.3.0. RÈGLE ABSOLUE : copier-adapter, jamais recoder. Avant d'écrire
la moindre ligne, récupère l'équivalent existant :
  git show main:<chemin/du/fichier>
Le catalogue des fichiers et de leur catégorie est dans refork/inventaire.json
(OURS_ONLY = copie telle quelle ; BOTH_DIFFER = adapter notre version aux imports
et structures de la nouvelle base).

TA STORY : [{{STORY_ID}}] {{STORY_TITRE}}
CRITÈRE D'ACCEPTATION (binaire) : {{CRITERE}}

CONTRAINTES NON NÉGOCIABLES :
- i18n : toute string UI passe par t() dans les 3 locales (fr-FR, ar-MA, en-US) ;
  aucune string zh-CN dans l'UI. RTL : composants compatibles ar-MA.
- Zéro erreur TypeScript, zéro warning lint, zéro TODO nu. Pas de `any` sans
  commentaire justificatif.
- Aucun secret en dur. Ne touche pas à README/CONTRIBUTING/CHANGELOG (soft fork).
- N'invente aucun fichier de config : copie .env.example / server-providers.yml
  depuis la carrière puis adapte les seules clés qui ont changé en v0.3.0.

DEFINITION OF DONE : critère d'acceptation vérifié PAR COMMANDE dont tu colles la
sortie, puis quality gate : npx tsc --noEmit && pnpm lint && pnpm test.
Commit : "[{{STORY_ID}}] {{STORY_TITRE}}". Une story, un commit, rien hors scope.
TU T'ARRÊTES : à tout choix d'architecture non couvert par la carrière ni par la
story → consigne la question dans .ralph/progress.md et termine sans passes=true.
```

## P0-B — Prompt : génération de la checklist garder/abandonner (prépare S0-011, la tranche reste à Amine)

```text
Tu travailles sur le repo Qalem, branche main (LECTURE SEULE). Objectif : produire
docs/foundation/0-socle/checklist-bascule.md — la liste EXHAUSTIVE des capacités
présentes sur main et absentes de la base v0.3.0 vierge, pour arbitrage humain.

SOURCES (croiser les trois, ne rien affirmer sans preuve fichier:ligne) :
1. .ralph/prd.json et .ralph/prd-ui.json : les 72 stories livrées (titres + critères).
2. refork/inventaire.json : les 264 fichiers OURS_ONLY et 257 BOTH_DIFFER.
3. Le routing app/ : chaque page/route réellement servie.

FORMAT DE SORTIE : tableau markdown — Capacité | Preuve (fichier:ligne) | Stories
liées | Utilisée en prod ? (si indéterminable, écrire INDÉTERMINABLE, ne pas deviner)
| Recommandation (garder/abandonner + une ligne de justification) | Décision (colonne
VIDE — réservée à Amine).
Grouper par domaine : génération, classroom/live, organisations, billing, certificats,
curriculum, spaced repetition, API v1, notifications, autres.
INTERDIT : décider à la place de l'humain, omettre une story, inventer un usage.
```

## P0-C — Parcours guidé passe RTL ar-MA (S0-012 — exécutant : Amine, préparé par Claude)

Livrable attendu de la story : un fichier `checklist-rtl.md` listant, écran par écran (accueil, génération, preview, classroom, paramètres, bibliothèque), les points de contrôle : direction du layout, icônes directionnelles retournées (`rtl-flip`), alignement des nombres et dates, ponctuation arabe, débordements. Chaque point = case à cocher + champ « défaut constaté ». Les défauts deviennent des stories de pioche chiffrées.
