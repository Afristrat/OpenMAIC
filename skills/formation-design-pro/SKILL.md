---
name: formation-design-pro
description: Concevoir ou industrialiser une formation Qalem fondée sur une performance observable, puis produire un contrat structuré pour la génération, l’évaluation et l’animation multi-agent. Utiliser pour créer, adapter, auditer ou régénérer une formation, choisir explicitement entre pédagogie, andragogie et approche hybride, cadrer les interactions des agents et empêcher les ratios, cas locaux ou affirmations non sourcés.
---

# Formation Design Pro

## Produire le contrat avant le contenu

1. Identifier la performance observable attendue, les acquis, les contraintes, les sources autorisées et les preuves de réussite.
2. Demander à l’auteur de choisir explicitement `pedagogy`, `hybrid` ou `andragogy`. Ne jamais déduire cette décision de l’âge seul.
3. Compiler le plan de formation avec le moteur `qalem-prompt-compiler`. Ne pas recréer ses schémas ni ses politiques.
4. Concevoir chaque activité et chaque évaluation en fonction de sa contribution à la performance visée. Ne jamais imposer de ratio universel de théorie, pratique, parole ou apprentissage entre pairs.
5. Produire une constitution d’animation persistante avant le live. Lire [le contrat de conception](references/formation-design-contract.md) pour les entrées, sorties et invariants.

## Séparer le prévu de l’adaptatif

- Écrire une ossature minimale liée aux scènes : intention, moment, formes d’intervention possibles, agents éligibles et modalité.
- Laisser le directeur adapter l’intervention aux réponses, questions, hésitations, incompréhensions, désaccords et occasions de transfert réelles.
- Autoriser exemples, cas d’usage, anecdotes, humour et angles morts seulement lorsqu’ils servent un objectif explicite et respectent les règles de sources.
- Conserver le texte visible de toute prise de parole et utiliser une identité voix, avatar et prénom validée dans le roster de l’organisation.
- Prendre les poids d’interaction dans un instantané du roster de l’organisation. Ne pas inventer de fréquence dans le prompt.

## Bloquer plutôt qu’inventer

Bloquer la production lorsque manquent le mode choisi par l’auteur, la performance cible, une preuve de réussite, une source requise ou une identité agent compatible. Étiqueter toute hypothèse autorisée. Ne jamais fabriquer un cas local, une référence, une statistique ou une règle de conformité.

## Ressources Qalem

- Lire [le contrat de conception et d’animation](references/formation-design-contract.md) pour produire ou auditer la constitution.
- Utiliser `lib/formation-engine/animation-constitution.ts` comme source de vérité exécutable.
- Utiliser `skills/qalem-prompt-compiler/references/compiled-plan.schema.json` pour le plan de génération.
- Utiliser `skills/qalem-prompt-compiler/references/design-policy-contract.md` pour les politiques de conception.
- Utiliser `skills/qalem-prompt-compiler/references/evaluation-promotion-contract.md` pour l’évaluation et la promotion.
