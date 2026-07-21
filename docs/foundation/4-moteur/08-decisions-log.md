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

## ADR-404 — Autonomie d’exécution des options réversibles (ACTÉE — 2026-07-18)

- **Vecteurs** : V-01 à V-07 de `vecteurs-valides.md`.
- **Tranche d’Amine** : « agir en total autonomie » ; « le temps c’est de l’argent et tu le gaspilles allègrement ».
- **Quoi** : les options recommandées des sept vecteurs sont validées pour exécution sans micro-validation supplémentaire. Les opérations irréversibles, la publication externe et les engagements juridiques restent hors de cette délégation.
- **Pourquoi** : supprimer la délégation inversée et avancer jusqu’à une preuve système.
- **Sources** : inventaire S4-001, `07-legal-compliance.md`, inventaire live LiteLLM du 2026-07-18.
- **Alternatives rejetées** : copie complète de Prompt Engineer Pro ; corpus propriétaire dans le dépôt public ; questionnaire fixe ; confiance aveugle dans `/model/info` ; heuristiques universelles ; synchronisation manuelle ; promotion sans evals.
- **Impact aval** : CRÉER consomme le compilateur ; VIVRE et ANCRER consomment les mêmes politiques ; la skill autonome est publiée depuis la source canonique.

## ADR-405 — Frontière exécutable du corpus privé (ACTÉE — exécution V-01, 2026-07-21)

- **Vecteur** : V-01 — Séparer le corpus propriétaire du dépôt distribuable.
- **Rectification factuelle** : le dépôt courant est public et détecté MIT, pas AGPL. La dette de provenance AGPL de S0-014 reste distincte et ouverte.
- **Quoi** : source canonique privée et externe ; emplacements d'entrée privée gitignorés ; publications Qalem exhaustivement manifestées par provenance et SHA-256 ; test permanent de frontière.
- **Pourquoi** : empêcher qu'une compilation, une copie manuelle ou une synchronisation future publie silencieusement le corpus propriétaire.
- **Limite** : l'état des deux artefacts déjà publics est enregistré sans nouvelle concession de licence. La licence commerciale future et la création du dépôt privé restent hors de la délégation ADR-404.
- **Preuves** : `.formation-engine-boundary.json`, `skills/formation-design-pro/publication.json`, `scripts/check-formation-engine-boundary.mjs`, `tests/skills/formation-engine-boundary.test.ts`.

## ADR-406 — Adaptateur de prompts minimal et exécutable (ACTÉE — exécution V-02, 2026-07-21)

- **Vecteur** : V-02 — Fork spécialisé, pas copie de Prompt Engineer Pro.
- **Quoi** : compilateur TypeScript pur qui reçoit un contrat, des tâches atomiques et un registre injecté ; il sélectionne uniquement des couples tâche/modèle validés, choisit une stratégie par capacité et isole les entrées non fiables des instructions système.
- **Pourquoi** : rendre l’ossature documentaire `qalem-prompt-compiler` réellement consommable sans créer une troisième copie de la skill globale.
- **Alternative rejetée** : import ou copie de fichiers depuis `prompt-engineer-pro` ; routage par nom ou origine supposée du modèle.
- **Preuves** : `lib/formation-engine/prompt-compiler.ts`, `tests/formation-engine/prompt-compiler.test.ts`, schéma portable `skills/qalem-prompt-compiler/references/compiled-plan.schema.json`.

## ADR-407 — Cadrage progressif par impact de design (ACTÉE — exécution V-03, 2026-07-21)

- **Vecteur** : V-03 — Contrat de cadrage progressif.
- **Quoi** : observations explicites ou inférées ; seuil de confiance vérifié ; hypothèses reliées à leur preuve ; questions activées uniquement par leur impact réel sur l’objectif, le public, le risque, la modalité, les sources, l’accessibilité ou la diffusion.
- **Pourquoi** : éviter le questionnaire fixe tout en interdisant qu’une information absente devienne silencieusement un fait.
- **Internationalisation** : questions natives `fr-FR`, `ar-MA` et `en-US` dans le contrat portable.
- **Preuves** : `lib/formation-engine/progressive-framing.ts`, `tests/formation-engine/progressive-framing.test.ts`, intégration au statut `needs_input` du compilateur.

## ADR-408 — Heuristiques de design conditionnelles et traçables (ACTÉE — exécution V-05, 2026-07-21)

- **Vecteur** : V-05 — Remplacer les ratios universels par des politiques conditionnelles.
- **Quoi** : aucune valeur pédagogique n'est appliquée par défaut. Une plage chiffrée n'est recevable qu'avec des conditions structurées, une justification, un déclencheur, une méthode de mesure et une référence probante. Les politiques compatibles sont intersectées ; un conflit bloque la génération et exige un arbitrage explicite.
- **Pourquoi** : une proportion de pratique, de théorie, d'apprentissage entre pairs ou de contexte local ne devient pas valide parce qu'elle est répétée. Elle dépend de la performance, des acquis, du risque, de la modalité et des contraintes vérifiées.
- **Internationalisation** : les trois personas du manifeste `fr-FR`, `ar-MA` et `en-US` portent la même règle sans quotas fixes.
- **Impact aval** : le compilateur injecte la résolution dans le contrat non fiable ; CRÉER ne peut pas générer sur une contradiction. VIVRE et ANCRER devront consommer les mêmes politiques lors de leur câblage.
- **Preuves** : `lib/formation-engine/design-policies.ts`, `tests/formation-engine/design-policies.test.ts`, `tests/formation-engine/published-heuristics.test.ts`, contrat portable `skills/qalem-prompt-compiler/references/design-policy-contract.md`.

## ADR-409 — Capacités prouvées par probe, jamais déduites du transport (ACTÉE — exécution V-04, 2026-07-21)

- **Vecteur** : V-04 — Registre de capacités certifiées.
- **Quoi** : l'inventaire LiteLLM alimente uniquement les références et les capacités annoncées. Un probe daté et relié à une preuve rend une capacité joignable ; une évaluation datée rend un couple tâche/capacité utilisable. Une disparition de l'inventaire ou un probe plus récent en échec invalide le routage sans effacer les preuves historiques.
- **ComfyUI** : la valeur de transport `image_generation` n'est plus traduite par une liste statique de noms. Le workflow doit prouver sa capacité métier réelle.
- **Qualité opératoire** : le registre conserve qualité linguistique, limites, latence, restrictions et fallback ; les fallbacks absents, auto-référents ou cycliques sont refusés.
- **Limite** : les seuils de promotion des évaluations appartiennent à V-07. V-04 garantit la structure, les transitions et l'impossibilité de contourner les preuves.
- **Preuves** : `lib/ai/capability-registry.ts`, `tests/ai/capability-registry.test.ts`, schéma portable `skills/qalem-prompt-compiler/references/capability-registry.schema.json`.

## ADR-410 — Promotion à trois portes et seuils versionnés (ACTÉE — exécution V-07, 2026-07-21)

- **Vecteur** : V-07 — Évaluation avant promotion.
- **Quoi** : chaque politique nomme son golden set et fixe explicitement ses seuils. La promotion exige simultanément les checks déterministes demandés, un juge dont la calibration est suffisante et encore valide, puis un échantillon humain conforme. Tous les motifs d'échec sont conservés.
- **Anti-contournement** : une validation `passed` sans références de checks, de jugements calibrés et de revues humaines est rejetée par le registre. Une évaluation plus récente en échec invalide le couple tâche/capacité sans supprimer l'historique.
- **Langues** : une tâche déclarant une locale ne peut être routée que si cette locale est couverte par le golden set et sa mesure linguistique.
- **Indépendance** : la politique décide explicitement si le juge doit être distinct du modèle évalué ; aucun modèle juge n'est imposé globalement.
- **Preuves** : `lib/formation-engine/evaluation-promotion.ts`, `tests/formation-engine/evaluation-promotion.test.ts`, contrat portable `skills/qalem-prompt-compiler/references/evaluation-promotion-contract.md`.

## — Réservé aux vecteurs (gabarit) —

```
## ADR-4XX — [Titre du vecteur validé]
- **Vecteur** : n° et libellé exact tel que proposé.
- **Tranche d'Amine** : citation de sa validation (date).
- **Quoi / Pourquoi / Sources / Alternatives rejetées** : …
- **Impact aval** : CRÉER / VIVRE / ANCRER (commits de mise à jour des briefs concernés).
```
