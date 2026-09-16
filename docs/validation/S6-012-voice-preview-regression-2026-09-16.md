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
