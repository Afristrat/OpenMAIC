# S6-012 — Régression de préécoute vocale : correction de lecture

Date : 16 septembre 2026

Statut : clôturé ; correctif déployé et audibilité confirmée sur navigateur réel.

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

Le build de déploiement était donc validé au SHA livré. À ce stade, la dernière
preuve à recueillir était volontairement limitée à l’écoute d’une voix depuis
chacun des deux sélecteurs de l’accueil authentifié.

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

Coolify a construit ce SHA en rolling deploy : le nouveau conteneur était
`healthy`, l’ancien a été retiré seulement après sa disponibilité et
`GET https://qalem.ma/api/health` répondait HTTP 200. L’écoute humaine des deux
sélecteurs restait alors le seul critère de cette régression qui ne pouvait pas
être déduit du serveur.

## Recertification du 26 septembre 2026

La préécoute lancée depuis le sélecteur de la formatrice sur le workspace
`Qalem Démo` a produit le toast localisé « Le test TTS a échoué ». Le journal
du conteneur a identifié la cause exacte : `INSUFFICIENT_TENANT_CREDITS`. Ce
tenant Pro actif possédait 26 cours et un contrôle de facturation actif, mais
aucun portefeuille ni aucune écriture de crédit. Une allocation administrative
auditable de 1 000 crédits a créé le portefeuille ; le rapprochement relit
ensuite exactement 1 000 000 000 microunités dans le portefeuille et dans le
ledger, avec `consistent=true`.

Une recette authentifiée éphémère a ensuite exercé le même endpoint
`POST /api/generate/tts` sur `Human Yo Impact`, sans contourner le décompte :

- aperçu français, voix `hanae` : HTTP 200, WAV RIFF de 140 204 octets,
  débit réel de 78 840 microunités ;
- aperçu anglais, voix `mehdi` : HTTP 200, WAV RIFF de 126 764 octets,
  débit réel de 71 280 microunités ;
- solde tenant : 996 326 420 → 996 176 300 microunités ;
- pour chaque appel, le compte et l’adhésion temporaires ont été supprimés ;
  la lecture finale retourne zéro adhésion résiduelle.

La génération, l’isolation tenant et le débit réel FR/EN étaient donc de nouveau
prouvés sur le SHA de production courant. S6-012 restait néanmoins ouverte à ce
stade : le contrôle du navigateur authentifié avait été interrompu avant
l’écoute physique et aucune preuve serveur ne pouvait remplacer le verdict
humain dans chacun des deux sélecteurs de l’accueil.

## Verdict humain final du 26 septembre 2026

Amine a ouvert successivement le sélecteur de la formatrice puis celui d’un
agent sur l’accueil authentifié et confirme explicitement : « Audible les deux ».
Cette observation porte sur le lecteur réel des deux composants corrigés, et non
sur un fichier WAV téléchargé séparément.

Au moment de la consignation, la production sert toujours le SHA fonctionnel
`0a15d648fcb20061ccfa79059d0d68cdec6e7bfb`, `/api/health` répond HTTP 200 et
le conteneur est `healthy`, `restart=0`, `OOMKilled=false`. La régression de
préécoute est donc clôturée.
