# 08 — Decisions log (ADR) · Chantier 4 — MOTEUR

> **Fil conducteur** — Numérotation 4xx. Particularité du chantier : la plupart des ADR naîtront des VECTEURS validés par Amine — ce fichier est pré-structuré pour les recevoir. Seules les décisions de PROCESSUS sont actées aujourd'hui.

## ADR-401 — Refonte par vecteurs validés un par un (ACTÉE — décision de Amine, 2026-07-09)

- **Quoi** : le chantier procède par vecteurs numérotés (constat sourcé + proposition + impact + coût), chacun soumis à validation individuelle d'Amine avant exécution ; remise à zéro des orientations antérieures.
- **Pourquoi** : verbatims — « la skill nous n'avons rien validé dessus donc on doit bien le moment venu travailler de fond en comble dessus » ; « ce que je te propose comme Skill se lit par toi, s'améliore si je valide tes vecteurs » ; division du travail : le savoir métier appartient à Amine.
- **Alternatives rejetées** : refonte en bloc proposée puis amendée (déjà tentée avant le 2026-07-09 — a produit des orientations non consenties, d'où la remise à zéro).

## ADR-402 — Double cible non négociable (ACTÉE — décision d'Amine)

- **Quoi** : chaque évolution du moteur sert la plateforme ET reste récupérable en skill autonome ; un vecteur mono-cible doit le déclarer.
- **Pourquoi** : verbatim — « elle doit intervenir directement dans cette plateforme mais je dois aussi avoir la skill toute seule au cas où j'ai besoin de l'utiliser ailleurs ».
- **Alternatives rejetées** : moteur purement plateforme (perd l'usage nomade) ; skill seule (laisse la vitrine skills non alimentée).

## ADR-403 — Le dossier ne démarre pas le chantier (ACTÉE)

- **Quoi** : les documents 4-moteur rendent le chantier prêt (processus, garde-fous, backlog) ; l'exécution attend le signal explicite d'Amine (« le moment venu »).
- **Pourquoi** : respecter la priorité qu'il donnera (les chantiers 0-2 portent le quick-win) ; éviter le travail spontané sur sa matière propre.

## — Réservé aux vecteurs (gabarit) —

```
## ADR-4XX — [Titre du vecteur validé]
- **Vecteur** : n° et libellé exact tel que proposé.
- **Tranche d'Amine** : citation de sa validation (date).
- **Quoi / Pourquoi / Sources / Alternatives rejetées** : …
- **Impact aval** : CRÉER / VIVRE / ANCRER (commits de mise à jour des briefs concernés).
```
