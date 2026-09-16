# S6-012 — Régression de préécoute vocale : correction de lecture

Date : 16 septembre 2026

Statut : correctif en attente de déploiement et d’écoute sur navigateur réel.

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
