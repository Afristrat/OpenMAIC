# 10 — Execution prompts · Chantier 4 — MOTEUR

> **Fil conducteur** — Tronc : gabarit P0-A du socle. ⚠️ Le moteur n'a JAMAIS été cadré (rappel Amine 2026-07-10) : les prompts ci-dessous servent le FUTUR cadrage (inventaire, formulation de vecteurs), pas une exécution de contenu — il n'y a rien à exécuter tant que les vecteurs ne sont pas validés.

## P4-A — Inventaire du corpus (S4-001 — lecture seule stricte)

```text
Tu inventories un corpus de skill de conception de formations, en LECTURE SEULE
STRICTE (aucune écriture dans les répertoires sources).

SOURCES (les trois, intégralement) :
1. <OneDrive>\formations skill\            (source maître déclarée)
2. ~/.claude/skills/formation-design-pro/  (copie installée)
3. C:\projets\Qalem\DIAGNOSTIC-formation-design-pro.md (diagnostic transmis)

LIVRABLE : docs/foundation/4-moteur/inventaire-corpus.md
1. Arborescence complète des deux copies (fichier, taille, mtime).
2. Écarts entre copies MESURÉS par script (fichiers absents d'un côté, diffs) —
   jamais « semble identique ».
3. Par fichier : sujet en une ligne · redondances détectées avec d'autres fichiers ·
   présence de contenu de source tierce (extraits d'ouvrages, supports externes) : o/n.
4. Constats FACTUELS uniquement — AUCUNE proposition, AUCUN jugement de refonte
   (les vecteurs viendront après, c'est une autre étape).
```

## P4-B — Formulation d'un lot de vecteurs (S4-002/S4-003 — la validation reste à Amine)

```text
À partir de l'inventaire fourni (inventaire-corpus.md), formule des VECTEURS
d'amélioration pour un propriétaire de produit qui validera un par un.
Le corpus est SON actif métier : tu proposes, tu ne décides rien.

CHAQUE vecteur, format strict :
- V-XX — Titre en une ligne
- CONSTAT : fait sourcé (fichier:ligne ou mesure de l'inventaire), vérifiable.
- PROPOSITION : une action précise et bornée.
- OPTIONS : 2-3 avec coûts respectifs, recommandation argumentée en une phrase.
- IMPACT DOUBLE CIBLE : effet sur la plateforme Qalem ET sur la skill autonome
  (si mono-cible : le dire explicitement).
- CE QUE ÇA NE DÉCIDE PAS : les questions qui restent ouvertes après ce vecteur.

RÈGLES : pas plus de 7 vecteurs par lot (validabilité humaine) ; aucun vecteur
« fourre-tout » ; aucun vecteur business (pricing, distribution, clients) ;
les orientations de sessions antérieures au 2026-07-09 ne sont PAS des acquis —
si tu en reprends une, elle redevient une simple option parmi d'autres.
```

## P4-C — Test de la skill autonome (S4-006 — après refonte validée)

Protocole : depuis un répertoire SANS le repo Qalem, invoquer la skill sur un cas réel de conception (« conçois une formation de 2 jours sur X pour un public adulte marocain ») et vérifier : (a) la skill se charge et suit son protocole, (b) le livrable porte la signature andragogique (06-brand), (c) aucune référence cassée vers des fichiers de la plateforme. Un échec = le mécanisme de double publication (vecteur S4-002) est défaillant — retour au vecteur, pas de rustine.
