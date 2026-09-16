# S6-012 — Régression de préécoute vocale : correction de lecture

Date : 16 septembre 2026

Statut : correctif déployé ; écoute sur navigateur réel encore requise.

## Constat

La synthèse Higgs répondait en production avec un WAV valide, mais les deux
sélecteurs de voix de la page d’accueil authentifiée reconstruisaient chacun
leur propre lecteur à partir d’une URL `data:`. Ce chemin différait du lecteur
commun déjà utilisé par les paramètres TTS ; une erreur de décodage ou de
lecture postérieure à `play()` pouvait ainsi terminer silencieusement le
sélecteur.

## Correction structurelle

`AgentVoicePill` et `TeacherVoicePill` utilisent désormais `useTTSPreview`,
le lecteur commun qui :

- décode la réponse base64 dans un `Blob` audio et lit une URL objet ;
- révoque systématiquement cette URL ;
- annule une requête TTS en cours lors d’un changement de voix, d’une fermeture
  du menu ou d’un démontage ;
- conserve l’identifiant explicite de l’organisation transmis par la classroom,
  y compris pour un super-administrateur ;
- laisse l’erreur de génération ou de décodage remonter vers le toast localisé.

La modification retire deux implémentations divergentes de préécoute. Elle ne
prétend pas démontrer l’audibilité physique d’un navigateur ou d’un périphérique
de sortie : cette dernière vérification reste nécessaire après déploiement.

## Déploiement contrôlé

Coolify a terminé le déploiement `w6qu5p0b4xier4zll51ea7le` du SHA
`d4577f1a89a4edc90c13d275a8db6ce53f2a716c`. La file a d’abord été contrôlée
pour éviter une révision obsolète ; une première mise en file annulée n’a jamais
remplacé le conteneur public. Le conteneur web finalement servi porte ce SHA,
est `healthy` et `GET https://qalem.ma/api/health` retourne HTTP 200 avec TTS
déclaré disponible.

Le build de déploiement est donc validé au SHA livré. La dernière preuve à
recueillir reste volontairement limitée à l’écoute d’une voix depuis chacun des
deux sélecteurs de l’accueil authentifié.

## Correctif complémentaire — contexte d’organisation

Une seconde cause a été isolée : l’accueil monte la barre d’agents avant la
résolution asynchrone de l’organisation active. Les deux sélecteurs restaient
alors cliquables avec un `orgId` absent, alors que l’API TTS refuse à juste
titre toute génération sans organisation.

Le SHA `47bb983e9d0456a2b7831be7972ce0cd96d6d1c4` rend les préécoutes muettes
et non interactives jusqu’à cette résolution. Dès que l’organisation est
chargée, tous les créateurs retrouvent exactement le catalogue standard
autorisé. Il ne s’agit donc ni d’une restriction de rôle ni d’un contournement
de l’isolation tenant.

Coolify a construit ce SHA en rolling deploy : le nouveau conteneur est
`healthy`, l’ancien a été retiré seulement après sa disponibilité et
`GET https://qalem.ma/api/health` répond HTTP 200. L’écoute humaine des deux
sélecteurs demeure le seul critère de cette régression qui ne peut pas être
déduit du serveur.
