# S-047 — Mesures de discussion structurées

## Candidat du 10 septembre 2026

`discussion-observation.ts` fournit un schéma strict et un buffer local sans
client de base ni requête réseau. Identité de discussion, scène et tours sont
explicites. Chaque tour porte agent, type heuristique, durée écoulée en
millisecondes et état terminé/interrompu/échoué. Une interruption ne devient
pas une réponse complète et un texte absent donne un type inconnu.

La durée utilise une horloge monotone ; elle n’est pas une mesure de parole
audio, d’attention ou d’engagement. La classification lit le texte transitoirement
sans le conserver. Le rôle « class-clown » ne force plus une plaisanterie ;
le point d’interrogation arabe est reconnu. Le collecteur historique réexporte
la même fonction pure, sans double implémentation.

Le premier score reçu après la fermeture est conservé, zéro compris ; absent
reste null. Ce seul ordre de réception ne prouve pas l’origine serveur du quiz
ni un effet causal de la discussion. Ces garanties restent à établir lors du
raccordement. Les doublons sont ignorés, les tours simultanés et une horloge
reculant sont refusés. Le plafond de 256 tours provoque une erreur explicite,
pas une troncature silencieuse. Les snapshots sont détachés du buffer.

## Validation et reste

ServeurIA 68633, exit 0 : cinq tests ciblés, TypeScript et lint globaux verts.
Tests déterministes : ordre, durées, interruption, zéro/null, premier score,
doublons, horloge, débordement, texte non retenu et champs étrangers refusés.
Aucune recette navigateur, collecte, migration, activation ou publication.

**Le buffer n’est pas encore instancié par le chat.** Ne pas le présenter comme
une collecte livrée. Prochain travail : création uniquement sous consentement
vérifié et destruction au changement d’epoch ; événements réels du StreamBuffer ;
envoi durable et persistance transactionnelle validant utilisateur, stage,
organisation, agents et résultat de quiz. Le `collectDiscussionData` hérité
reste sans appelant et son INSERT direct ne doit pas être branché tel quel.
Puis agrégation/retrait/export et recette intégrée avec S-048. S-047 reste ouverte.

Ponytail : état local borné, Zod et classificateur existants réutilisés, aucune
dépendance nouvelle. La lecture des callbacks a distingué le temps de révélation
du texte et celui de la génération ; le raccordement devra nommer la mesure
effectivement choisie, pas lui attribuer une signification andragogique non prouvée.
