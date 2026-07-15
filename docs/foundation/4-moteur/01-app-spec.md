# 01 — App-spec · Chantier 4 — MOTEUR (refonte formation-design-pro)

> **Fil conducteur** — Amont : la vitrine skills du code porté (interface `lib/skills/` + manifests) et le corpus existant (`~/.claude/skills/formation-design-pro/` + source maître OneDrive + `DIAGNOSTIC-formation-design-pro.md`). Aval : le moteur alimente le 1-CRÉER (overrides de génération), le 2-VIVRE (andragogie du live, matière des personnalités) et le 3-ANCRER (registre des graines). **⚠️ Statut unique parmi les 5 dossiers : LE MOTEUR (la skill) N'A JAMAIS ÉTÉ CADRÉ — rappel explicite d'Amine, 2026-07-10. Ce dossier N'EST PAS ce cadrage : il fige uniquement le PROCESSUS par lequel le cadrage aura lieu « le moment venu » (interrogatoire dédié + vecteurs validés un par un) et les deux seules décisions déjà prises par Amine (double cible, validation vecteur par vecteur). Tout le reste — contenu, architecture, périmètre — reste À CADRER.**

## Ce qu'on construit

**Le moteur andragogique de la plateforme, à double cible (verbatim Amine)** :
1. « elle doit intervenir directement dans cette plateforme » — le savoir andragogique (Knowles, ADDIE, Bloom, Kirkpatrick, adaptation culturelle Maroc/Afrique) devient le CONTENU consommé par l'interface skills câblée au chantier 1 (S1-001) : overrides de prompts, définitions d'agents, templates de classe.
2. « je dois aussi avoir la skill toute seule au cas où j'ai besoin de l'utiliser ailleurs » — la skill Claude Code autonome reste utilisable hors plateforme.

**Méthode imposée (verbatim)** : « ce que je te propose comme Skill se lit par toi, s'améliore si je valide tes vecteurs » — Claude lit le corpus de fond en comble, propose des VECTEURS d'amélioration un par un, Amine valide vecteur par vecteur. Aucune orientation antérieure n'est acquise (y compris l'« architecture A » évoquée avant la remise à zéro).

## Parcours critique (du chantier — c'est un chantier de savoir, pas d'écrans)

1. **Inventaire prouvé du corpus** : lister et lire l'intégralité (source maître OneDrive `formations skill\`, copie installée `~/.claude/skills/formation-design-pro/`, diagnostic transmis) ; écarts entre les copies mesurés par script, pas à l'œil.
2. **Vecteurs proposés par lots** : chaque vecteur = constat sourcé (fichier:ligne du corpus) + proposition + impact sur les 3 consommateurs (CRÉER/VIVRE/ANCRER) ; ⏸️ validation d'Amine vecteur par vecteur.
3. **Refonte exécutée** sur les vecteurs validés uniquement.
4. **Publication double cible** : le contenu validé alimente (a) les manifests/overrides plateforme, (b) la skill autonome — mécanisme de synchronisation à trancher PAR UN VECTEUR dédié (pas ici).
5. **Preuve** : un même savoir produit un effet observable dans la génération plateforme (test S1-001 étendu) ET dans la skill seule.

## Ce que ce dossier EXCLUT (les 3 refus)

1. **Aucune décision d'architecture du corpus** (canonique repo vs OneDrive vs autre) — c'est le premier vecteur à proposer, Amine tranche.
2. **Aucune réécriture de contenu andragogique sans vecteur validé** — le savoir métier formation est le domaine d'Amine ; Claude propose, ne remplace pas.
3. **Aucun démarrage avant son signal** — « le moment venu » (verbatim) : le dossier rend le chantier prêt à démarrer, il ne le démarre pas.

## Hypothèses restantes et leur test

| Hypothèse | Test | Critère de réfutation |
|---|---|---|
| L'interface skills portée (manifest + `getPromptOverride`) suffit à véhiculer le moteur sans refonte du loader | Vecteur technique dédié, après S1-001 | Types/loader inadaptés (dette `Skill.name` en est l'indice) → vecteur de refonte d'interface, chiffré |
| Le corpus OneDrive et la copie installée sont réconciliables sans perte | Diff scripté à l'inventaire (étape 1) | Divergences contradictoires → arbitrage d'Amine fichier par fichier |

## Traçabilité verdict

GO option C′ global (np-cadrage §7) ; ce chantier démarre au signal d'Amine. Checkpoint permanent : CHAQUE vecteur est un ⏸️ — c'est la règle du chantier, pas l'exception.
