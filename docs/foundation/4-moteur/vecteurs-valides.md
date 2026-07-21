# Vecteurs validés — architecture et structure du moteur

Validation opératoire d’Amine, 2026-07-18 : « agir en total autonomie » et « le temps c’est de l’argent ». Cette tranche autorise l’exécution des options recommandées réversibles ci-dessous, sans nouvelle micro-validation.

## V-01 — Séparer le corpus propriétaire du dépôt distribuable

- **Constat corrigé le 2026-07-21 par preuve système** : le dépôt courant est public et GitHub détecte MIT ; `LICENSE` et `package.json` déclarent également MIT. La mention « code AGPL » était donc factuellement fausse pour cette branche, même si S0-014 conserve une dette de provenance AGPL distincte. Le risque immédiat est la publication accidentelle du corpus propriétaire dans un dépôt public sous licence détectée MIT.
- **Proposition** : maintenir le corpus canonique hors du repo public Qalem ; Qalem ne contient que schémas, compilateur, adaptateurs et artefacts générés explicitement redistribuables.
- **Options** : A) corpus dans Qalem — exposition publique et coût juridique élevés ; B) repo privé canonique consommé au build — coût d’intégration moyen ; C) copie locale — divergence certaine. **Recommandation : B.**
- **Impact double cible** : Qalem consomme une publication versionnée ; la skill autonome est générée depuis la même source.
- **Ce que ça ne décide pas** : licence commerciale future du corpus.

## V-02 — Fork spécialisé, pas copie de Prompt Engineer Pro

- **Constat** : la skill globale compte 79 fichiers et plus de 1 Mo ; la copier créerait une troisième maintenance.
- **Proposition** : créer un adaptateur Qalem minimal qui référence les principes utiles, compile un contrat de tâche et sélectionne une stratégie par capacités vérifiées.
- **Options** : A) copie complète — coût de dérive fort ; B) sous-module — couplage poste ; C) adaptateur minimal — coût faible. **Recommandation : C.**
- **Impact double cible** : compilateur intégré à Qalem ; spécification portable réutilisable par la skill autonome.
- **Ce que ça ne décide pas** : modèle choisi pour chaque tâche.

## V-03 — Contrat de cadrage progressif

- **Constat** : le Mode 0 impose sept questions même lorsque certaines réponses sont déjà connues.
- **Proposition** : inférer les champs disponibles, demander uniquement les inconnues qui changent le design, consigner hypothèses et niveau de confiance.
- **Options** : A) questionnaire fixe ; B) aucune question ; C) cadrage progressif. **Recommandation : C.**
- **Impact double cible** : formulaire/dialogue Qalem et invocation autonome partagent le même schéma.
- **Ce que ça ne décide pas** : interface visuelle finale.

## V-04 — Registre de capacités certifiées

- **Constat** : LiteLLM expose 83 entrées, sans garantir leur opérationnalité ; ComfyUI transporte toutes ses modalités via `image_generation`.
- **Proposition** : séparer `référencé`, `joignable`, `validé`, avec capacité métier, probe, date, qualité linguistique, limites et fallback.
- **Options** : A) faire confiance à `/model/info` ; B) liste statique ; C) registre alimenté par probes. **Recommandation : C.**
- **Impact double cible** : Qalem route les générations ; la skill autonome produit des variantes sans dépendre d’un fournisseur unique.
- **Ce que ça ne décide pas** : seuils de certification, définis par les evals de chaque modalité.

## V-05 — Heuristiques conditionnelles et traçables

- **Constat** : ratios 70/20/10, 30/70, 60 % local et charge ≤ 2,5 sont encodés comme règles absolues sans preuve contextuelle.
- **Proposition** : les convertir en options avec justification, plage, déclencheur et mesure ; aucune valeur universelle par défaut.
- **Options** : A) conserver les absolus ; B) supprimer les frameworks ; C) politiques conditionnelles. **Recommandation : C.**
- **Impact double cible** : prompts Qalem plus adaptés ; skill autonome plus rigoureuse.
- **Ce que ça ne décide pas** : valeurs par secteur, audience et modalité.

## V-06 — Source unique et publication déterministe

- **Constat** : source maître, copies `.claude`, `.agents`, doublons `maj/` et manifeste Qalem divergent.
- **Proposition** : une source canonique privée, un build déterministe produisant skill autonome et bundle Qalem, avec manifeste de provenance et empreintes.
- **Options** : A) synchronisation manuelle ; B) source Qalem ; C) publication déterministe depuis source privée. **Recommandation : C.**
- **Impact double cible** : les deux sorties sont prouvées issues du même commit source.
- **Ce que ça ne décide pas** : emplacement du futur repo privé.

## V-07 — Évaluation avant promotion

- **Constat** : aucun golden set ne mesure actuellement la qualité du moteur ; les E2E Qalem centraux sont largement mockés.
- **Proposition** : compiler chaque prompt avec une spec d’évaluation, exécuter probes et golden sets, puis promouvoir seulement les couples tâche/modèle validés.
- **Options** : A) revue humaine seule ; B) tests statiques seuls ; C) checks déterministes + juges calibrés + échantillon humain. **Recommandation : C.**
- **Impact double cible** : Qalem obtient un routeur fiable ; la skill autonome conserve ses tests de non-régression.
- **Ce que ça ne décide pas** : modèles juges définitifs.
