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

Au premier candidat, le buffer n’était pas instancié par le chat. Les compléments
ci-dessous ont remplacé l’INSERT hérité puis raccordé le chat sous consentement.
Le résultat de quiz vérifié et la recette intégrée avec S-048 restent ouverts.

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

À ce stade de la persistance seule, l’entrée HTTP/chat et l’outbox restaient à
raccorder ; le complément suivant les apporte. Ne pas activer la collecte avant
la liaison fiable au quiz, l’export personnel et les agrégats tenant validés.
Ponytail/Supabase : client, pseudonyme et cascade existants réutilisés, aucune
dépendance supplémentaire ni fonction publique à privilèges élevés.

## Raccordement chat → observations → reprise → RPC

Le chat QA/discussion émet maintenant des signaux structurés : début de boucle,
début de tour, classification des segments entièrement révélés, fin de tour et
fin de boucle. Un changement de scène sépare les discussions. La fin est émise
aussi en cas d’erreur/abandon ; un tour non terminé devient interrompu, pas réussi.
Les tours successifs des agents dans une boucle partagent un identifiant UUID.
La mesure couvre la révélation, les délais et les éventuelles pauses de l’UI,
jamais une durée de parole ni une preuve d’attention. Aucun texte supplémentaire
n’est conservé ou émis dans ces signaux ; la classification reste heuristique.

Le buffer d’apprentissage existant possède les buffers de discussion : sans
consentement vérifié, aucun n’est créé ; après renouvellement d’epoch, des tours
sans nouveau signal de début sont ignorés. Les contrôles stage/tenant/scène
précèdent l’ajout. Plafond de 32 discussions par enveloppe, 256 tours chacune,
et limite existante de 64 Kio : un dépassement produit une erreur, pas une
troncature ni une conservation garantie au-delà du quota du navigateur.

La fin ferme l’enveloppe et utilise la file localStorage existante, par compte,
avec revalidation du consentement avant envoi et purge existante au retrait.
`/api/learning-observations` reçoit le nouveau champ strict `discussions` ; aucun
second endpoint ou format d’outbox n’a été ajouté. Le collecteur serveur appelle
les RPC consenties avec l’acteur authentifié. Les écritures parent/enfants sont
séquentielles et idempotentes, **pas une transaction globale** : un échec partiel
renvoie une erreur, conservant l’enveloppe pour reprise. Le refus du consentement
interrompt l’admission. Le score quiz soumis dans une discussion est refusé.

ServeurIA 16724 exit 0 : 29 tests ciblés, TypeScript/lint et deux Chromium sur
le vrai parcours de saisie d’une question, avec deux réponses d’agents. Sans
consentement : aucun POST d’observation. Avec consentement : une discussion,
deux agents dans l’ordre, tours terminés, durées non négatives, score NULL et
aucun texte dans l’enveloppe. Chat, voix et persistance HTTP sont simulés : ce
n’est pas une recette production ni une preuve du fournisseur vocal.

La reprise locale avec les tours est testée par reconstruction de l’outbox ; les
tests serveur vérifient erreur enfant/rejeu, refus parent et refus enfant. Le
contrat HTTP refuse une discussion sans tenant ou avec un score client.
62710 exit 0 : 31 tests ciblés, TypeScript/lint et neuf parcours Chromium existants
d’observation (reprise, fermeture, retrait et quiz compris). Ces neuf parcours
valident la non-régression du circuit commun, pas neuf recettes de discussion.
40818 exit 0 : TypeScript/lint et deux Chromium renforcés attendent explicitement
le signal final `end` avant de constater l’absence d’envoi sans consentement.

Prochain point identifié dans `lib/quiz/sync.ts` : le quiz ordinaire écrit depuis
le client par upsert, identifiant stable utilisateur/stage/scène/tenant, sans
nouvel horodatage de tentative dans la charge. Relier ce seul enregistrement ne
prouverait ni une tentative postérieure ni une notation recalculée côté serveur.
Il faut résoudre cette provenance avant d’associer les scores aux discussions.
Restent aussi export personnel/agrégats, recette intégrée, gate au SHA propre et
publication. Aucune migration durable ni activation effectuée dans ce complément.
