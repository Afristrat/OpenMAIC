# 04 — Feature backlog · Chantier 4 — MOTEUR

> **Fil conducteur** — Ce backlog séquence le PROCESSUS de refonte (chaque « story » produit des vecteurs à valider, pas des features décidées). Démarrage : au signal d'Amine. Les stories techniques (S4-401+) dépendent de S1-001 (interface câblée au chantier 1).

## v1 gelée (processus — critères binaires)

| ID | Story | Critère d'acceptation (binaire) |
|---|---|---|
| S4-001 | Inventaire prouvé du corpus | Les 3 sources lues intégralement (OneDrive maître, copie installée, diagnostic) ; écarts entre copies mesurés par script (liste de fichiers + diffs) ; synthèse d'inventaire SANS proposition |
| S4-002 | **[⏸️ AMINE]** Vecteurs lot 1 : architecture et réconciliation | Vecteurs numérotés couvrant : où vit le corpus canonique, réconciliation des copies divergentes, mécanisme de double publication — chacun avec options + coûts + recommandation ; tranche d'Amine consignée en ADR-401+ |
| S4-003 | **[⏸️ AMINE]** Vecteurs lot 2 : contenu (structure du savoir) | Vecteurs sur la structure du corpus (SKILL.md 1238 lignes → cible, purge des doublons `maj/`, pedagogical-frameworks vs -updated, module preuve d'impact — pistes du diagnostic, à re-proposer sans les considérer acquises) ; validations consignées |
| S4-004 | Exécution des vecteurs validés (par lot, itératif) | Chaque vecteur validé exécuté et commité isolément (référence du vecteur en commit) ; rien exécuté hors validation |
| S4-005 | Publication cible plateforme | Le savoir validé alimente les manifests/overrides ; test hérité de S1-001 : un override du moteur change observablement une génération |
| S4-006 | Publication cible skill autonome | La skill seule fonctionne hors plateforme (invocation réelle sur un cas de conception de formation, sans le repo Qalem) |
| S4-007 | Cohérence des consommateurs aval | Les registres de personnalités (2-VIVRE) et de graines (3-ANCRER) référencent le moteur refondu — zéro duplication de savoir entre chantiers (vérifiable par grep des sources) |

## Parking lot (condition de sortie obligatoire)

| Item | Condition de sortie |
|---|---|
| Dette `lib/skills/types.ts:55` (`Skill.name: string` vs Record i18n) | Premier vecteur technique touchant le loader (S4-002 tranché) |
| Personnalités au-delà des 10 canoniques (génération dynamique selon profil) | Moteur refondu stable + demande explicite (croise le parking lot 2-VIVRE) |
| Skill marketplace / distribution externe de la skill | Décision business Amine exclusivement |
| Mode 0 / découverte des besoins (absent identifié à l'audit) | Vecteur de contenu proposé au lot 2, si Amine le retient |
