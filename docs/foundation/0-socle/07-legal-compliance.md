# 07 — Legal & compliance · Chantier 0 — SOCLE

> **Fil conducteur** — Ce document traite le juridique DE LA BASE (licences, données portées). Les chantiers aval héritent et ajoutent leur couche : 2-VIVRE (enregistrement de sessions, watermarking = données biométriques ? consentement), 3-ANCRER (pushes, sollicitations post-formation). L'audit de conformité complet est DÉLÉGUÉ à la skill `rgpd-bounty-hunter` — ce fichier ne duplique pas ses checklists.

## 1. Licences (fait vérifié, décision à consigner)

**Faits (preuves lues le 2026-07-09/10)** :
- Notre fork dérive d'OpenMAIC **v0.1.0 sous AGPL-3.0** (notre `LICENSE` actuelle, 661 lignes).
- L'upstream **v0.3.0 est sous MIT** (`upstream-v030/LICENSE` lu : « MIT License, Copyright (c) 2026 THU-MAIC »).

**Analyse** : nos personnalisations copiées-adaptées sont des œuvres dérivées d'une base AGPL — les porter telles quelles sur la base MIT fait du fork combiné une œuvre où s'applique la licence la plus contraignante pour les parties concernées. MIT est compatible avec une intégration dans un projet AGPL (l'inverse n'est pas vrai).

**Recommandation (ADR-002, tranche Amine)** : garder **AGPL-3.0 pour notre fork** — coût quasi nul pour nous (nous opérons le service nous-mêmes ; l'obligation §13 de mise à disposition du code source aux utilisateurs du service réseau s'applique déjà aujourd'hui) et zéro risque de contamination inverse. Alternative « tout MIT » rejetée sauf réécriture clean-room des parties dérivées (coût sans valeur produit). ⚠️ Obligation AGPL §13 active dès aujourd'hui sur la prod : un lien vers les sources doit être offert aux utilisateurs — vérifier sa présence, sinon story de pioche.

## 2. Données personnelles — dettes assumées au stade du socle

Marchés : Maroc (loi 09-08, CNDP) + utilisateurs UE possibles (RGPD). Règle `max(RGPD, CNDP)`. ⚠️ Chaque texte cité se re-vérifie EN VIGUEUR (recherche live) avant toute publication d'artefact conforme — la réforme de la loi 09-08 est en discussion depuis plusieurs années, statut à re-vérifier au moment de la bascule prod.

| Dette assumée | Pourquoi acceptable maintenant | Déclencheur qui l'imposera |
|---|---|---|
| Pas d'audit rgpd-bounty-hunter sur la NOUVELLE base | La prod reste sur `main` ; la préprod n'a pas d'utilisateurs réels | AVANT la bascule prod (S0-011/S0-013) — audit sur `refork-v030` |
| Registre de traitement / politique de confidentialité non régénérés | Périmètre de traitement inchangé par le portage (mêmes données, même finalité) | Toute nouvelle collecte des chantiers 1-3 (enregistrements, watermark, pushes) |
| Pas de DPIA | Aucun traitement à risque élevé ajouté par le socle | Chantier 2 (enregistrement de sessions live + identifiant indélébile = traçage individuel → DPIA quasi certaine, à instruire AVANT le build, pas après) |

## 3. Ce que le socle doit faire (non négociable, dans les stories)

- RLS sur chaque table portée, policies testées (S0-003).
- Aucun secret hardcodé sur la nouvelle base (grep de vérification dans S0-007).
- `ssrf-guard` porté (S0-007) — protection des appels sortants providers.
