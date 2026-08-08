# Contrat de conception et d’animation

## Source exécutable

La source de vérité de la constitution d’animation est `lib/formation-engine/animation-constitution.ts`. Ce document explique comment la produire ; il ne duplique pas le schéma.

## Entrées obligatoires

- auteur et organisation propriétaires ;
- approche recommandée à partir du contexte, expliquée puis validée explicitement par l’auteur : pédagogie, hybride ou andragogie ;
- niveau d’interaction choisi ;
- territoire d’usage et devise ISO 4217 choisis ou hérités d’une trame puis confirmés par l’auteur ;
- performance observable visée et preuves de réussite ;
- roster d’agents validé par l’organisation ;
- sources autorisées, contraintes, accessibilité et sujets interdits ;
- scènes auxquelles rattacher l’ossature d’animation.
- plan de formation prévisualisé, modifiable et explicitement approuvé par l’auteur ou le super administrateur avant toute génération de scène.

Le rôle `author` conçoit la constitution pour son organisation. Le `super-admin` peut le faire dans toute organisation. Cette propriété du contrat ne remplace pas les contrôles d’autorisation côté serveur.

Le plan approuvé est une frontière transactionnelle. Lorsque l’auteur fournit un syllabus, le moteur le normalise et le soumet malgré tout à confirmation. Lorsqu’aucun syllabus n’est fourni, le moteur en propose un à partir du besoin, des documents analysés et des paramètres de conception. Il contient au minimum le titre, le public, les prérequis, l’objectif général, les objectifs d’apprentissage, la durée totale, la modalité, la stratégie d’évaluation et le livrable attendu. Chaque séquence expose son objectif et sa durée. Tous ces champs sont directement modifiables ; les séquences peuvent être ajoutées, supprimées et réordonnées par des commandes visibles, sans dépendre du glisser-déposer. Aucun contenu de scène ne peut être produit avant cette confirmation. Le worker consomme exactement le plan approuvé et ne génère jamais une ossature concurrente en arrière-plan.

Une source PDF n’est exploitable que si son texte est lisible. L’extraction locale est tentée en premier, puis un OCR configuré prend automatiquement le relais lorsque le résultat est vide ou corrompu. La présence de caractères ne constitue jamais, à elle seule, une preuve de réussite. Si aucun parseur ne fournit un texte lisible, le moteur bloque la génération et restitue la cause à l’auteur.

## Sorties industrielles

Une production complète livre quatre objets distincts :

1. le plan compilé, édité puis explicitement approuvé, consommé à l’identique par la génération des scènes ;
2. la constitution d’animation, persistée avec la classroom ;
3. les prises de parole ordinaires préproduites, intégrées au parcours canonique et aux exports ;
4. les décisions d’intervention prises pendant le live, persistées comme événements lorsque l’enregistrement est autorisé.

La trame conserve le contexte réutilisable. La classroom en prend un instantané modifiable. Une adaptation de territoire ou de devise cible uniquement les exemples, montants, ressources et narrations concernés ; elle ne reconstruit pas les objectifs, la progression, les évaluations ou l’animation sans nécessité démontrée. Toute conversion monétaire exige un taux actuel et une source vérifiable.

L’auteur ou le super administrateur doit prévisualiser la liste des scènes affectées avant d’appliquer une adaptation de marché. Cette prévisualisation indique pour chaque scène si le territoire, la devise ou les deux ont déclenché l’impact. Le moteur régénère uniquement les diapositives listées, conserve leurs objectifs, l’ordre et la structure pédagogique, et laisse toutes les autres scènes inchangées. Un type de scène non pris en charge bloque l’enregistrement global et demande une correction manuelle explicite.

Le nouveau contexte territorial et monétaire n’est persisté qu’après la réussite de toutes les régénérations demandées. Une conversion est interdite sans taux de change actuel et sourcé. Sans cette preuve, le montant est réécrit comme une hypothèse illustrative explicite dans la devise cible. Chaque régénération conserve son instantané d’annulation.

La constitution associe un parcours canonique reproductible à des règles adaptatives déclenchées uniquement par une action explicite de l’apprenant. Elle ne transforme pas chaque échange en appel réseau pendant la lecture.

## Prises de parole canoniques

Les prises de parole ordinaires préproduites sont générées en même temps que les scènes. Elles sont persistées dans l’ordre de lecture et contiennent au minimum :

- un identifiant stable d’intervention ;
- l’identifiant d’un agent actif du roster ;
- une forme et une finalité d’apprentissage ;
- le texte visible et prononcé ;
- la résolution de la voix et de l’avatar du roster.

Elles peuvent prendre la forme d’une question, d’une objection, d’une synthèse, d’un exemple, d’un retour, d’un cas d’usage, d’une anecdote, d’un trait d’humour, d’un désaccord, d’un angle mort, d’une clarification, d’un défi ou d’une régulation. Elles ne sont produites que lorsqu’elles servent un objectif identifié. Elles suivent le même ordre dans la classroom et dans l’export vidéo.

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

Trois actions de l’apprenant ouvrent explicitement un tour adaptatif :

- un message écrit réellement soumis ;
- un message vocal réellement soumis ;
- la sélection d’une intervention canonique pour l’approfondir.

La sélection conserve le curseur canonique. Quand l’échange adaptatif se termine, la lecture doit reprendre exactement au même point, sans sauter ni répéter une autre intervention.

Le directeur retourne un contrat structuré comprenant l’agent, le déclencheur, la forme et la raison d’apprentissage. Le serveur refuse un agent absent du roster, une forme hors de ses capacités, un déclencheur sans règle active ou une sélection sans intervention canonique identifiable. Une décision acceptée est persistée de façon idempotente avant d’être transmise au moteur de prise de parole.

Les cas, anecdotes et touches d’humour doivent être pertinents, inclusifs et compatibles avec les sources autorisées. Quand un contenu ne peut pas être présenté comme factuel, il est clairement qualifié d’hypothèse ou de scénario synthétique.

## Fin de scène

La fin de chaque scène affiche un choix persistant : `Approfondir` ou `Continuer`. Aucun appel adaptatif n’est lancé sans ce geste de l’apprenant. `Continuer` doit afficher la scène suivante avant de lancer son audio, afin que la voix ne précède jamais le visuel correspondant.

## Cohérence des agents

La constitution prend un instantané du roster publié par l’organisation : identifiant, prénom affiché, avatar, voix, validation de compatibilité, poids et capacités. Cet instantané garantit la reproductibilité d’une classroom même si le roster change ensuite.

Tout spécialiste contextuel reçoit aussi le territoire d’apprentissage. Son prénom doit être réellement plausible dans ce territoire, pas seulement dans la langue de l’interface. Le prénom, le genre déclaré, l’avatar et la voix forment une seule identité cohérente qui doit persister dans la classroom.

Chaque membre du casting actif doit apporter au moins une prise de parole canonique utile, conforme à sa persona. Un agent sans contribution ne doit pas être retenu dans le casting. Le plan répartit les interventions sur les scènes et peut placer plusieurs agents sur une même scène lorsque la formation est plus courte que le roster.

Un agent désactivé ne peut apparaître dans l’ossature ni dans une règle adaptative. Une identité non validée ne peut pas être publiée.

## Invariants

- aucune inférence silencieuse de l’approche d’apprentissage : la recommandation est expliquée et l’auteur la valide ;
- aucun ratio universel ;
- aucune intervention sans finalité d’apprentissage ;
- aucun agent inconnu ou désactivé ;
- aucune identité voix, avatar et prénom non validée ;
- aucune parole vocale sans transcription visible correspondante ;
- aucune prise de parole canonique absente de l’export vidéo ;
- aucune prise de parole sans décision structurée, autorisée et persistée ;
- aucune génération adaptative sans action explicite de l’apprenant ;
- aucune perte du point de reprise après un approfondissement ;
- aucun audio de scène suivante avant l’affichage de cette scène ;
- aucune devise implicite ou différente de la devise de référence hors comparaison explicitement signalée ;
- aucun laser réduit à un point central fugitif lorsqu’il doit guider la lecture d’une zone ;
- aucun dépassement du nombre de tours consécutifs choisi par l’auteur ;
- aucune anecdote, statistique, référence ou situation locale présentée comme factuelle sans fondement autorisé ;
- aucune confiance dans un rôle envoyé par le navigateur : le serveur reste l’autorité.
