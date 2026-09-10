# Sources Notion — accès par Diwan

## État vérifié le 10 septembre 2026

L’intégration Notion n’est pas encore livrée. La décision du 9 septembre fixe
une seule frontière documentaire : Qalem consomme des références fournies par
Diwan et ne démarre pas un second connecteur MCP direct vers Notion.

Qalem permet déjà à un auteur de sélectionner des sources Diwan pour son
organisation. La sélection est épinglée avec sa version et son empreinte ; au
moment de la génération, Qalem demande des passages limités à ces sources. Une
source modifiée, indisponible ou insuffisamment étayée bloque la génération au
lieu de basculer silencieusement vers le Web.

## Parcours attendu

Une intégration Notion utilisable doit d’abord être établie côté Diwan. Celui-ci
doit associer une page autorisée à un corpus, une source, une version et une
empreinte accessibles au seul tenant concerné. Qalem sélectionne ensuite cette
référence Diwan et l’emploie dans le plan puis dans la formation générée.

Un export manuel de page Notion importé comme fichier reste un import
documentaire. Il ne constitue pas une connexion Notion, ni une preuve de droits
sur une page distante.

## Conditions restantes

Le contrat Diwan v1 actuellement disponible ne décrit pas la connexion Notion,
la recherche de pages, la lecture de leur contenu ni la révocation d’un droit
Notion. Il faut donc, dans le projet propriétaire Diwan :

- un contrat fournisseur vérifiable pour les pages et bases de données Notion ;
- un mapping page/version vers corpus/source/version Diwan ;
- la gestion de perte de droits et de révocation ;
- un jeton interservice distinct par tenant.

Avant clôture, une recette doit prouver une page autorisée, le refus hors
droits, les passages réellement utilisés dans une formation, puis le retrait.
Les modifications Diwan et les identifiants fournisseurs ne relèvent pas du
répertoire Qalem.
