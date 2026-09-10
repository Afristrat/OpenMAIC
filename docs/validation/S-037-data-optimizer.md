# S-037 — Optimiseur, candidat sans minimum de sessions

## Restitution auteur du 10 septembre 2026

Le plan renvoie un rapport d’observations validé, conservé par son schéma et
affiché dans l’éditeur existant FR/AR/EN. Effectifs, scores total/séquence,
séquence conseillée et ajustement heuristique sont explicites. La comparaison
avec les types de scènes du plan courant est recalculée à chaque rendu ; elle
ne prétend mesurer ni la difficulté réellement produite ni un gain d’apprentissage.
Un rapport absent ou invalide n’affiche pas de faux résultat.

Le rapport est une métadonnée de présentation, jamais une entrée d’autorisation,
de collecte ou de calcul. Sa présence après retour du navigateur ne constitue
pas une preuve signée. La révision assistée ignore toute statistique produite
par le modèle et conserve seulement le rapport préexistant du plan validé.

62700 exit 0 : onze tests ciblés, TypeScript/lint globaux et trois Chromium
FR/AR/EN avec RTL. Les parcours navigateur utilisent une réponse de plan
simulée avec une observation et une séquence correspondante ; pas une recette
du calcul sur les données réelles. 89499 exit 0 : trois tests de révision,
TypeScript/lint après protection des métadonnées contre l’invention par le modèle.
Aucun build global, déploiement, collecte ou activation dans ce complément.
Restent recette intégrée zéro/une/plusieurs observations, retrait réel et
mesure d’effet selon le protocole ci-dessous, puis publication au SHA qualifié.
S-037 reste ouverte ; poursuivre le code manquant S-047 avant la recette globale.
Ponytail : éditeur et schéma de plan existants réutilisés, aucune dépendance ajoutée.

## Raccordement du 10 septembre 2026

`loadGenerationOptimization` est maintenant appelé par la génération de plan
et par la génération directe de classroom. Le sujet est l’identifiant de skill
résolu, le niveau vient des réglages de l’organisation et la langue du contexte
de génération. Sans skill actif ou contexte comparable, aucun sujet n’est inventé.

Le serveur vérifie les droits, sélectionne au maximum mille cours prêts de
l’auteur dans l’organisation, filtrés par niveau/langue/skill, puis interroge
l’optimiseur existant. Les observations sans `subject_hash` révocable sont
exclues. Les droits sur la génération sont recontrôlés après la lecture ; aucun
cache de suggestion n’est créé. Ce contrôle ne constitue pas une transaction
unique avec un transfert concurrent de tous les cours sources.

Le prompt reçoit la séquence de types, l’ajustement de difficulté et les volumes
observés dès la première observation. Il conserve la priorité des prérequis,
des objectifs, du nombre de scènes et de la difficulté demandés par l’auteur.
Un plan déjà approuvé n’est ni relu pour optimisation ni modifié. L’application
est un conseil au générateur, pas un tri mécanique qui pourrait casser les
prérequis, ni une preuve que le modèle a suivi chaque recommandation.

`QALEM_DATA_OPTIMIZATION_ENABLED=true` est requis pour activer le raccordement
sur web et worker ; toute autre valeur le laisse inactif. Aucune activation
effectuée. La vérification PostgREST réelle en lecture seule
`scripts/validation/s037-history-query.mjs` accepte la requête de cours dans un
périmètre synthétique vide (zéro ligne), et constate le worker inactif. Elle ne
prouve ni la collecte consentie ni le calcul sur des observations de production.

Tests ciblés : 27 tests verts, dont une suggestion à une observation transmise
au véritable constructeur du prompt du plan ; modèle et base simulés.
TypeScript et lint globaux verts, session ServeurIA 23418 terminée avec code 0.
Complément logger et script : session 71958, cinq tests/TypeScript/lint verts,
code 0. Le fichier de contrôle a été retiré du conteneur worker, puis son absence
vérifiée ; sa source demeure versionnée dans le dépôt.
Le runner reste une base antérieure avec fichiers superposés, pas un checkout
propre du SHA candidat. Pas de build global, navigateur ou déploiement dans ce lot.

### Protocole fixé avant activation

Comparer une génération classique et une génération avec conseil sur la même
demande, les mêmes sources versionnées, le même modèle et les mêmes contraintes
d’auteur. Conserver le volume et les scores à l’origine du conseil. Mesurer
séparément respect des contraintes, cohérence des prérequis, difficulté des quiz,
latence, erreurs et coût ; ne pas assimiler une variation de quiz généré à un gain
d’apprentissage. Pour mesurer ce dernier, utiliser des sessions d’apprentissage
avec score avant/après et affectation documentée, sans minimum imposé, en exposant
les effectifs et les limites de chaque observation. Ne pas basculer globalement
sur une amélioration supposée ; désactiver en cas de régression technique.

Restent à coder/valider : restitution auteur des conseils et de leur application,
recette navigateur zéro/une/plusieurs observations, cycle réel de retrait,
protocole exécuté, migrations S-036 coordonnées et gate intégré/publication.
S-037 reste ouverte. Ponytail : optimiseur et circuit de prompts réutilisés.
Supabase : filtres et autorisations explicites, requête native vérifiée sans
mutation ; [documentation select](https://supabase.com/docs/reference/javascript/select)
et [changelog](https://supabase.com/changelog) consultés, aucune mise à niveau.

## État antérieur au raccordement

Feu vert du 9 septembre 2026 consigné dans
`docs/decisions/2026-09-09-unblock-prd.md`. Aucun passes=true à ce stade.

Le module existant utilise la première observation exploitable. Une séquence
vide, des scores absents, non finis ou hors [0,1] ne deviennent pas des échecs
d’apprentissage. Les séquences sont groupées sans collision de séparateur ;
les égalités sont déterministes. Ajustement heuristique borné à ±0,2.

Le résultat expose le volume total, celui de la séquence retenue et les scores
observés, avec evidence=observational. Le champ confidence fondé arbitrairement
sur le volume a été supprimé. Aucun appelant existant trouvé par recherche.

La requête exige une liste de formations autorisées fournie par le serveur,
ne fait rien sans cette liste, filtre sujet/niveau/langue et utilise les mille
observations les plus récentes au maximum, avec un délai de cinq secondes.
Ce plafond borne la mémoire ; il ne constitue pas un minimum d’observations.
L’authentification et la construction de la liste restent à raccorder côté appelant.
Les erreurs de configuration, de transport ou de base rendent null, sans
imprimer les détails du fournisseur.

ServeurIA, session 45654 terminée exit 0 : 8/8 tests ciblés, TypeScript et lint
global sans avertissement. Les trois avertissements du test négatif sont les
messages applicatifs attendus, pas des avertissements ESLint.
Le schéma SQL existant définit déjà des scores normalisés [0,1] ; aucune
migration ni collecte n’est activée par ce lot.

Restent : données consenties et révocables de S-036, contexte autorisé construit
côté serveur, application de la suggestion au pipeline sans contredire les choix
de l’auteur, affichage de ses limites, recette navigateur et protocole de mesure.
Pas de gain andragogique déclaré ni de déploiement de ce candidat.

Ponytail : réemploi du client de service, de Zod et du logger, aucune dépendance.
La skill Supabase a conduit à vérifier la requête bornée et à préserver les
frontières d’autorisation. Référence :
[limitation des résultats](https://supabase.com/docs/reference/javascript/using-modifiers-limit).
