# Contrat de conception et d’animation

## Source exécutable

La source de vérité de la constitution d’animation est `lib/formation-engine/animation-constitution.ts`. Ce document explique comment la produire ; il ne duplique pas le schéma.

## Entrées obligatoires

- auteur et organisation propriétaires ;
- approche choisie explicitement : pédagogie, hybride ou andragogie ;
- niveau d’interaction choisi ;
- performance observable visée et preuves de réussite ;
- roster d’agents validé par l’organisation ;
- sources autorisées, contraintes, accessibilité et sujets interdits ;
- scènes auxquelles rattacher l’ossature d’animation.

Le rôle `author` conçoit la constitution pour son organisation. Le `super-admin` peut le faire dans toute organisation. Cette propriété du contrat ne remplace pas les contrôles d’autorisation côté serveur.

## Sorties industrielles

Une production complète livre trois objets distincts :

1. le plan compilé de formation, consommé par la génération des scènes ;
2. la constitution d’animation, persistée avec la classroom ;
3. les décisions d’intervention prises pendant le live, persistées comme événements lorsque l’enregistrement est autorisé.

La constitution ne contient pas un dialogue figé. Elle associe une ossature conçue par l’auteur à des règles adaptatives déclenchées par les signaux réels de l’apprenant.

## Ossature conçue par l’auteur

Chaque temps d’animation précise :

- la scène et le moment ;
- la finalité d’apprentissage ;
- les formes possibles : question, objection, synthèse, exemple, retour, cas d’usage, anecdote, humour, désaccord, angle mort, clarification, défi ou régulation ;
- les agents éligibles ;
- la modalité texte, voix ou les deux ;
- son caractère systématique ou conditionnel.

## Adaptation pendant le live

Le directeur peut réagir à une réponse, une question, une hésitation, un silence, une conception erronée, une incompréhension, une surcharge, un niveau de confiance, une transition, une occasion de transfert ou un risque non traité.

Chaque décision doit expliciter sa finalité. Une intervention n’est pas déclenchée pour faire exister un agent, remplir un quota ou simuler artificiellement une conversation.

Deux actions de l’apprenant ouvrent explicitement un tour adaptatif :

- Play, après la fin de la narration de la scène courante ;
- un message écrit ou vocal réellement soumis par l’apprenant.

Le directeur retourne un contrat structuré comprenant l’agent, le déclencheur, la forme et la raison d’apprentissage. Le serveur refuse un agent absent du roster, une forme hors de ses capacités, un déclencheur sans règle active ou un temps Play sans ossature autorisée. Une décision acceptée est persistée de façon idempotente avant d’être transmise au moteur de prise de parole.

Les cas, anecdotes et touches d’humour doivent être pertinents, inclusifs et compatibles avec les sources autorisées. Quand un contenu ne peut pas être présenté comme factuel, il est clairement qualifié d’hypothèse ou de scénario synthétique.

## Cohérence des agents

La constitution prend un instantané du roster publié par l’organisation : identifiant, prénom affiché, avatar, voix, validation de compatibilité, poids et capacités. Cet instantané garantit la reproductibilité d’une classroom même si le roster change ensuite.

Un agent désactivé ne peut apparaître dans l’ossature ni dans une règle adaptative. Une identité non validée ne peut pas être publiée.

## Invariants

- aucune inférence silencieuse de l’approche d’apprentissage ;
- aucun ratio universel ;
- aucune intervention sans finalité d’apprentissage ;
- aucun agent inconnu ou désactivé ;
- aucune identité voix, avatar et prénom non validée ;
- aucune parole vocale sans transcription visible correspondante ;
- aucune prise de parole sans décision structurée, autorisée et persistée ;
- aucun dépassement du nombre de tours consécutifs choisi par l’auteur ;
- aucune anecdote, statistique, référence ou situation locale présentée comme factuelle sans fondement autorisé ;
- aucune confiance dans un rôle envoyé par le navigateur : le serveur reste l’autorité.
