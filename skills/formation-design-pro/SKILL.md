---
name: formation-design-pro
description: Concevoir ou industrialiser une formation Qalem fondée sur une performance observable, puis produire un contrat structuré pour la génération, l’évaluation et l’animation multi-agent. Utiliser pour créer, adapter, auditer ou régénérer une formation, recommander puis faire valider une approche pédagogique, andragogique ou hybride, cadrer les interactions des agents et empêcher les ratios, cas locaux ou affirmations non sourcés.
---

# Formation Design Pro

## Produire le contrat avant le contenu

1. Identifier la performance observable attendue, les acquis, les contraintes, les sources autorisées, le territoire d’usage, la devise de référence et les preuves de réussite.
2. Recueillir la performance cible, les acquis, l’autonomie réelle, l’expérience mobilisable, le risque, les contraintes et la modalité. Recommander ensuite `pedagogy`, `hybrid` ou `andragogy`, expliquer les conséquences en langage courant, puis exiger la validation explicite de l’auteur. Ne jamais déduire cette recommandation de l’âge seul.
3. Compiler le plan de formation avec le moteur `qalem-prompt-compiler`. Si l’auteur fournit un syllabus, le normaliser sans en changer silencieusement l’intention. S’il n’en fournit pas, proposer un syllabus complet à partir du besoin et des sources analysées. Ce syllabus porte au minimum le titre, le public, les prérequis, l’objectif général, les objectifs d’apprentissage, la durée totale, la modalité, la stratégie d’évaluation et le livrable attendu. Une information inconnue est signalée comme restant à confirmer par l’auteur, jamais inventée.
4. Suspendre la production du contenu sur un écran auteur dédié. L’auteur ou le super administrateur doit pouvoir modifier chaque champ du syllabus, puis modifier, ajouter, supprimer et réordonner les séquences. Chaque séquence expose aussi son objectif d’apprentissage et sa durée. Les commandes de réorganisation doivent être visibles, y compris sans glisser-déposer. Le plan approuvé devient l’unique contrat consommé par la génération : il est interdit d’en régénérer un second en arrière-plan.
5. Concevoir chaque activité et chaque évaluation en fonction de sa contribution à la performance visée. Ne jamais imposer de ratio universel de théorie, pratique, parole ou apprentissage entre pairs.
6. Produire une constitution d’animation persistante avant le live. Lire [le contrat de conception](references/formation-design-contract.md) pour les entrées, sorties et invariants.
7. Ne retenir dans le casting que des agents qui apportent une contribution identifiable. Répartir au moins une prise de parole canonique utile par agent actif, même lorsque le roster comporte plus de membres que la formation ne comporte de scènes.

Le territoire et la devise sont des variables structurées de la trame, jamais des détails déduits d’un exemple. Les recopier dans la classroom afin qu’une adaptation ultérieure puisse retraiter uniquement les cas, montants, ressources et narrations concernés. Ne jamais convertir un montant existant sans taux actuel et source vérifiable.

## Ingérer les sources sans faux succès

Pour un PDF, tenter d’abord l’extraction textuelle locale. Un résultat vide, composé de caractères de contrôle ou manifestement illisible n’est pas une extraction réussie. Déclencher alors automatiquement un parseur OCR configuré et ne transmettre au moteur que du texte exploitable. Si aucun parseur ne produit un résultat lisible, afficher la cause à l’auteur et conserver le fichier sélectionné afin qu’il puisse réessayer sans recommencer son cadrage.

## Adapter une classroom à un nouveau marché

Avant toute régénération, prévisualiser la liste des scènes affectées et expliquer pour chacune si le territoire, la devise ou les deux sont en cause. Ne modifier automatiquement que les diapositives explicitement listées. Signaler les autres types de scènes comme corrections manuelles tant qu’un éditeur compatible n’existe pas.

Pendant l’adaptation, conserver les objectifs, l’ordre et la structure pédagogique. Localiser uniquement les exemples, contraintes, budgets, textes visibles et notes de présentation qui dépendent du marché. Ne jamais convertir un montant sans taux de change actuel et sourcé. Sans source suffisante, reformuler le montant comme une hypothèse illustrative explicite dans la devise cible. Enregistrer le nouveau contexte seulement après la réussite de toutes les régénérations demandées. Les scènes non affectées restent strictement inchangées.

## Séparer le canonique de l’adaptatif

- Écrire les prises de parole ordinaires préproduites avec le contenu de chaque scène. Elles font partie du parcours canonique, restent visibles dans la conversation et sont incluses dans chaque export vidéo.
- Attribuer chaque prise de parole canonique à un agent actif du roster avec un identifiant stable d’intervention, une forme, une finalité d’apprentissage et le texte prononcé. La voix et l’avatar du roster portent cette intervention ; le formateur ne parle jamais à la place d’un autre agent.
- Concevoir ces échanges seulement lorsqu’ils améliorent la compréhension, la mémorisation ou le transfert. Ne jamais remplir un quota ni simuler une conversation décorative.
- Réserver la génération adaptative en direct à une action explicite de l’apprenant : message écrit ou vocal, ou sélection d’une intervention canonique pour l’approfondir.
- Après une branche adaptative, reprendre exactement au même point du parcours canonique.
- À la fin d’une scène, proposer durablement `Approfondir` et `Continuer`. Si l’apprenant continue, afficher la scène suivante avant de lancer son audio.
- Autoriser exemples, cas d’usage, anecdotes, humour et angles morts seulement lorsqu’ils servent un objectif explicite et respectent les règles de sources.
- Conserver le texte visible de toute prise de parole et utiliser une identité voix, avatar et prénom validée dans le roster de l’organisation.
- Prendre les poids d’interaction dans un instantané du roster de l’organisation. Ne pas inventer de fréquence dans le prompt.
- Exiger pour chaque routage un agent, un déclencheur, une forme et une raison d’apprentissage. Refuser la décision si l’un de ces éléments sort de la constitution, puis la persister avant la prise de parole.
- Lorsqu’un laser accompagne une explication, couvrir la zone utile de l’élément visé et maintenir le guidage pendant un temps réellement lisible. Un point central fugitif ne constitue pas un guidage visuel valide.

## Bloquer plutôt qu’inventer

Bloquer la production lorsque manquent le mode choisi par l’auteur, la performance cible, une preuve de réussite, une source requise, un plan explicitement approuvé ou une identité agent compatible. Étiqueter toute hypothèse autorisée. Ne jamais fabriquer un cas local, une référence, une statistique ou une règle de conformité.

## Ressources Qalem

- Lire [le contrat de conception et d’animation](references/formation-design-contract.md) pour produire ou auditer la constitution.
- Utiliser `lib/formation-engine/animation-constitution.ts` comme source de vérité exécutable.
- Utiliser `skills/qalem-prompt-compiler/references/compiled-plan.schema.json` pour le plan de génération.
- Utiliser `skills/qalem-prompt-compiler/references/design-policy-contract.md` pour les politiques de conception.
- Utiliser `skills/qalem-prompt-compiler/references/evaluation-promotion-contract.md` pour l’évaluation et la promotion.
