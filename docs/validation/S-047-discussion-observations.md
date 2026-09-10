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
envoi durable, résultat de quiz vérifié et recette intégrée avec S-048.
Le chemin de persistance décrit ci-dessous remplace désormais l’INSERT hérité,
mais reste sans appelant HTTP/chat. S-047 reste ouverte.

Ponytail : état local borné, Zod et classificateur existants réutilisés, aucune
dépendance nouvelle. La lecture des callbacks a distingué le temps de révélation
du texte et celui de la génération ; le raccordement devra nommer la mesure
effectivement choisie, pas lui attribuer une signification andragogique non prouvée.

## Persistance consentie — complément du 10 septembre

`collectDiscussionData(actorId, session)` valide l’identité serveur et le contrat,
puis appelle uniquement `record_consented_discussion`, avec une échéance de cinq
secondes. Refus du consentement = false ; réponse incohérente ou erreur de stockage
= exception générique, sans journaliser de détail fournisseur. Le calcul hérité
d’« engagement » inutilisé a été retiré : fréquence/longueur des messages ne
deviennent pas une mesure d’apprentissage.

Migration créée par la CLI : `20260910033146_consented_discussion_collection.sql`.
RPC invoker réservée au service, droits directs anon/authenticated retirés,
consentement et epoch sous verrou ; organisation active, membre, stage, scène,
agents et partage autorisé contrôlés. Le pseudonyme privé existant est réutilisé,
distinct par tenant ; retrait RLS du consentement → effacement en cascade.
Rejeu strict identique admis ; changement de tenant, stage ou contenu refusé.
Le contexte provient d’un cours prêt unique, jamais du navigateur. Les tours
conservent les millisecondes exactes ; la colonne historique reste en secondes.
Le score quiz et l’engagement restent NULL : aucune association non vérifiée.

ServeurIA, session 9502 exit 0 : huit tests ciblés, TypeScript et lint globaux.
Recette PostgreSQL `scripts/validation/s047-discussion-collection.sql`, transaction
annulée : refus, ancien epoch, insertion/rejeu, mesures et contexte, faux agent,
scène étrangère, charge modifiée, score client, partage non vérifié puis vérifié,
pseudonymes distincts, suspension, ancien membre, privilèges et retrait sous RLS.
Une première tentative a échoué car les prérequis créés par la CLI étaient vides
dans le runner ; les sources versionnées ont été transférées avant la reprise
réussie. Après ROLLBACK : zéro compte, stage ou organisation de recette, zéro
discussion et zéro colonne candidate. Les séquences éventuellement consommées
par les triggers ne sont pas réinitialisées.

La base réelle comptait zéro discussion avant la recette ; aucun historique
n’a été attribué ni effacé. Pas de migration durable, d’activation ni de
déploiement. Le runner reste un ancien socle avec overlays, pas un gate intégré
au SHA propre. Aucun test navigateur n’est revendiqué pour cette persistance.
L’advisor CLI local est indisponible, ce qui ne constitue pas un audit vert.

Prochain code : entrée HTTP et buffer sous consentement/epoch, branchement réel
des tours, outbox, liaison à un quiz persisté puis export personnel et agrégats
tenant. Ne pas activer la collecte avant ces raccordements et leur validation.
Ponytail/Supabase : client, pseudonyme et cascade existants réutilisés, aucune
dépendance supplémentaire ni fonction publique à privilèges élevés.
