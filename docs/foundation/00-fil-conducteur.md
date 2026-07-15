# 00 — Fil conducteur des 5 chantiers Qalem

> Index de lecture des dossiers de fondation (5 chantiers × 10 documents). Généré le 2026-07-10 sous verdict **GO option C′** (`docs/np-cadrage.md` §7 — source de vérité du cadrage global). Niveau L99.

## La chaîne de valeur (sens de lecture)

```
0-SOCLE ──► 1-CRÉER ──► 2-VIVRE ──► 3-ANCRER
(base v0.3.0    (3 portes :     (le CŒUR :       (10-90 jours :
 + copie-        générer,        classe live      graines, quiz,
 adaptation      catalogue,      multi-agents,    évaluations à
 de nos          importer ;      casting          chaud/à froid,
 personnali-     exports         personnalisé,    reporting)
 sations)        2 couches)      replay,
                                 watermark)
                      ▲               ▲                ▲
                      └───────────────┴────────────────┘
                            4-MOTEUR (la skill — JAMAIS CADRÉE à ce jour :
                            le dossier prépare son cadrage, il ne le remplace pas)
```

## Dépendances opposables

| Règle | Détail |
|---|---|
| Rien avant S0-008 | Aucune story des chantiers 1-3 ne démarre avant le quality gate complet du socle |
| `courses` est le pivot | Le 2-VIVRE lance une classe depuis un `course_id` sans connaître sa porte d'entrée (1-CRÉER) |
| Le vécu nourrit l'ancrage | `live_sessions`/`session_events` (2) sont la matière des graines et évaluations (3) |
| Le moteur irrigue, il ne duplique pas | Registres des personnalités (2/06) et anatomie des graines (3/06) consomment le 4-MOTEUR — une seule source de voix |
| Checkpoints humains | S0-011 (garder/abandonner), S0-012 + passes RTL (ar-MA), S1-002 (canevas, co-validation), S2-011 (prénoms/cultures), S3-008 (ton des graines), chaque vecteur du 4 (⏸️ systématique) |
| Transverses | ADR 0xx = tronc (`0-socle/08`) ; flags = table `feature_flags` ; erreurs généralisables remontent au `0-socle/09` |

## Structure de chaque dossier

`01-app-spec` · `02-data-dictionary` · `03-claude-directives` (ADR-007 : remplace le CLAUDE.md par chantier) · `04-feature-backlog` (v1 gelée + parking lot) · `05-integrations` · `06-brand-brief` (couches : le 0 est la référence) · `07-legal-compliance` · `08-decisions-log` (ADR 0xx/1xx/2xx/3xx/4xx) · `09-errors-log` · `10-execution-prompts`.

## Exécution

Ralph loop : les backlogs 04 se compilent en `.ralph/prd.json` (Phase 4 np). Le temps se compte en itérations Ralph ; seuls les checkpoints humains listés ci-dessus sont incompressibles.
