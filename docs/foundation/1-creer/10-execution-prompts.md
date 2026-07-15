# 10 — Execution prompts · Chantier 1 — CRÉER

> **Fil conducteur** — Prompts exacts pour exécutants externes/isolés (aucun accès aux documents de fondation). Le gabarit child Ralph du socle (`0-socle/10-execution-prompts.md`, P0-A) reste le tronc — instancié avec S1-XXX. S'ajoutent ici les prompts propres au chantier.

## P1-A — Proposition de canevas d'import (prépare S1-002 — la co-validation reste humaine)

```text
Tu es un ingénieur pédagogique. Objectif : proposer UN canevas de dépôt de contenu
de formation, que des créateurs humains devront respecter pour que leur contenu
soit transformé automatiquement en classe interactive (outline → scènes → quiz).

CONTRAINTES DU PIPELINE AVAL (non négociables) :
- La transformation attend : des sections hiérarchisées (chapitres → séquences),
  des objectifs d'apprentissage par chapitre, au moins un support d'évaluation
  (questions ou points de contrôle) par chapitre.
- Langues acceptées : français, arabe standard moderne, anglais.
- Formats de fichiers : docx, pdf (texte, pas scanné), markdown.
- INTERDIT dans le contenu déposé : données nominatives de tiers.

LIVRABLE : un document "canevas-import-v1-PROPOSITION.md" avec :
1. La structure exigée (arborescence commentée + exemple minimal COMPLET en FR).
2. Les règles de validation numérotées (chacune testable par programme : oui/non).
3. Les motifs de rejet avec le message d'erreur exact associé (ton : diagnostic
   utile, jamais sanction — citer la règle + l'action corrective en une phrase).
4. Les points laissés OUVERTS à l'arbitrage humain, listés en fin de document.
TU NE DÉCIDES PAS : la version finale sera co-validée par deux humains ;
ta proposition doit maximiser la testabilité programmatique de chaque règle.
```

## P1-B — Brief Hyperframes pour une capsule (S1-006 — consommé par le pipeline Mishkāt)

Gabarit du fichier d'interface (JSON déposé, contrat entre les deux systèmes — toute évolution se négocie avec la session Mishkāt) :

```json
{
  "brief_version": "1.0",
  "course_id": "<uuid>",
  "scene_ref": "<id de scène Qalem>",
  "language": "fr-FR | ar-MA | en-US",
  "direction": "ltr | rtl",
  "title": "<titre de la capsule>",
  "narration_text": "<texte exact à synthétiser — déjà vocalisé (tachkil) si AR>",
  "audio_provider": "higgs",
  "brand": { "primary": "#722ed1", "background": "#faf8ff" },
  "slides": [ { "heading": "…", "bullets": ["…"], "visual_hint": "…" } ],
  "output": { "format": "mp4", "subtitles": true }
}
```

Règle : les valeurs `brand` proviennent des variables du socle — si la palette change dans `globals.css`, ce gabarit se met à jour dans le même commit.

## P1-C — Story Ralph type du chantier (instancier P0-A)

Utiliser le gabarit P0-A du socle en remplaçant le bloc CONTEXTE par :

```text
CONTEXTE : chantier CRÉER sur la base refork-v030 (v0.3.0 + socle porté).
MAIC Editor et Edit with AI sont NATIFS : consomme-les, ne les réimplémente pas.
Toute feature en cours s'abrite derrière son feature flag (table feature_flags).
Le contenu andragogique (prompts pédagogiques) ne s'écrit PAS dans ce chantier :
tu câbles l'interface skill (getPromptOverride), le contenu vient d'ailleurs.
```
