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

## 10 septembre — Tentatives de quiz ordinaires vérifiées par le serveur

Le parcours ordinaire appelle désormais `/api/quiz-attempts`. L’acteur vient de
`requireAuth`, et le client ne fournit que l’organisation, le stage, la scène,
un UUID de requête et ses réponses. Aucun corrigé, score ou choix de langue
client n’est accepté. Le contenu et la langue sont lus dans la base après
vérification de la scène quiz, du tenant actif, de son membre et du partage
vérifié si nécessaire ; une source suspendue est refusée aussi.

La candidate CLI `20260910035605_classroom_quiz_attempts.sql` conserve une ligne
par requête utilisateur, avec snapshot du contenu, réponses et dates serveur.
Une requête identique reprend la même tentative ; une requête modifiée est
refusée. Un bail de quatre minutes empêche la correction simultanée du même
identifiant. Les corrections de réponses libres sont checkpointées ; le moteur
LTI existant traite au plus trois appels bornés à une minute par tranche HTTP.
Un rejeu terminé renvoie le résultat enregistré. Une erreur ne vaut jamais
demi-score. Un appel modèle interrompu avant son checkpoint peut devoir être
répété : ce dispositif ne garantit pas un appel fournisseur exactement unique.

La table a RLS active, sans privilèges navigateur ; les RPC invoker sont
réservées au service. L’identité, le contenu et les dates initiales ne sont pas
modifiables par les privilèges UPDATE accordés au service. Le client réemploie
le cache durable et le transport LTI sous un scope distinct compte/tenant/
stage/scène. Le résultat affiché est le pourcentage serveur. Aucun historique
client n’a été rétroactivement certifié. Les résumés `quiz_results`, cartes FSRS
et événements hérités restent distincts du nouveau registre faisant autorité.

ServeurIA 60984 exit 0 : 63 tests ciblés (quiz natif, route HTTP, transport,
notation et soumission LTI, persistance et synchronisation), TypeScript et lint.
La première passe navigateur 31837 : neuf parcours observations réussis et
deux échecs du fichier quiz, dus à l’ancien dénominateur attendu et à une route
de recette non simulée. Les attentes ont été alignées sur le reçu serveur,
sans retirer le contrôle FSRS. Les trois nouvelles recettes natives FR/AR/EN
prouvent un 503 sans note, le rechargement, le même UUID et les mêmes réponses.
Les appels HTTP de navigateur sont simulés, pas une recette du modèle réel.

66210 exit 0 : TypeScript/lint et dix parcours Chromium quiz passent sans retry,
dont reprises natives et LTI en FR/AR/EN, arabe RTL, édition, cartes FSRS et
attente de leur persistance. L’étape précédente 26479 avait neuf réussites et
un sélecteur ambigu entre le score 100 et le volume audio 100 ; le contrôle est
désormais restreint au bloc résultat, pas affaibli par un choix arbitraire.
Le correcteur commun accepte aussi une consigne facultative vidée dans
l’éditeur (`commentPrompt=''`), sans accepter une question vide ; ce cas porte
le lot ciblé à 64 tests réussis (95255 exit 0, TypeScript et lint également verts).

Le script `scripts/validation/s047-classroom-quiz-attempts.sql` a passé sur
PostgreSQL réel sous BEGIN/ROLLBACK : bail/reprise, checkpoint immuable,
tentatives distinctes, reçu stable, contenu modifié, tenant/source suspendus,
partage non vérifié/révoqué, membre retiré, privilèges et cascade après
suppression du compte. Les premières exécutions du script ont révélé un
prérequis omis et deux contraintes de nettoyage de la fixture ; elles ont été
annulées, puis corrigées. Relecture fraîche : table candidate absente, zéro
utilisateur, organisation ou stage synthétique. Advisor CLI local indisponible
(connexion 54322 refusée), donc aucun audit advisor déclaré vert.

Ponytail a conduit au réemploi du correcteur, des checkpoints et du transport
existants. La checklist Supabase a guidé les privilèges et les RPC invoker ;
[documentation de diagnostic consultée](https://supabase.com/docs/guides/observability).
Aucune activation, migration durable ou publication. Le runner est une ancienne
base avec overlays, pas un SHA propre : ce n’est pas un gate intégré. Restent
le rattachement vérifié de ces tentatives aux discussions, l’export personnel,
les agrégats, la recette intégrée et la publication. S-047 reste ouverte.

## 10 septembre — Liaison serveur, export et lecture des agrégats

Candidate CLI `20260910042141_discussion_quiz_linkage.sql` : chaque nouvelle
discussion reçoit une date de réception serveur, sans backfill historique.
À l’insertion d’une tentative native, le consentement est verrouillé et la
dernière discussion reçue avant sa soumission, du même compte/tenant/stage,
est retenue. Une contrainte unique réserve cette discussion à la première
tentative ; les suivantes ne remplacent pas sa note et ne remontent pas à une
discussion plus ancienne. Aucun score ni identifiant d’association n’est fourni
par le navigateur. La correction achevée publie la note serveur sur 0–1.

La fermeture du quiz prend le verrou de consentement avant celui de la
tentative ; le retrait supprime le pattern et annule sa référence dans la
tentative. L’évaluation fonctionnelle reste corrigeable sans consentement aux
analyses. La suppression d’une tentative efface son score analytique. La
liaison décrit l’ordre de réception serveur, pas une causalité ni une durée de
validité cognitive : une discussion transmise après la soumission ne peut pas
lui être associée rétroactivement. Les quiz LTI restent hors de cette liaison
native ; aucune réception LMS n’est inventée.

L’export personnel existant comprend `classroom_quiz_attempts` et
`discussion_patterns`, paginés par UUID. La projection exclut les baux et le
contenu/corrigé intégral du cours ; elle inclut les réponses personnelles, le
reçu final et la provenance de l’association. RPC invoker réservée au service,
acteur issu de l’authentification, aucune lecture des observations étrangères.

`getBestPatterns` appelle maintenant une RPC exigeant acteur, organisation et
stages. Elle recontrôle membre/tenant actif, contexte/langue, partage vérifié,
consentement et jointure avec la tentative native complète. La moyenne est
calculée depuis le reçu, pas depuis un score historique isolé. Mille lignes
récentes maximum, aucun minimum ; les groupes restent séparés par séquences
d’agents et d’interventions. Le Director actif n’appelle pas encore ce lecteur :
son raccordement reste S-048, sans activation ni promesse de gain causal.

SQL réel BEGIN/ROLLBACK : discussion tardive non associée, première tentative,
zéro conservé, seconde tentative non substituée, export propre/étranger,
suppression, retrait pendant correction, maintien de l’évaluation fonctionnelle,
agrégat à une observation et refus d’un acteur étranger. Relecture : zéro
compte/stage synthétique, RPC et table candidates absentes. Advisor local
indisponible (54322 refusé), pas un audit réussi.

99791 exit 0 : 48 tests et TypeScript/lint. 91567 : 58 tests et TypeScript/lint
verts ; trois échecs navigateur dus au mock du profil qui ignorait le paramètre
`purpose=xapi`, corrigé dans la fixture commune sans tolérance ajoutée à la
console. La recette navigateur simule la réponse d’export ; PostgreSQL est
vérifié séparément, ce n’est pas une chaîne production bout en bout.

56997 exit 0 : format de la fixture, TypeScript/lint et quatre Chromium verts
sans retry (téléchargement FR/AR/EN, arabe RTL, et erreur d’export sans quitter
le profil). Le contenu téléchargé conserve les nouvelles sections et le zéro.

Ponytail : triggers, contraintes et export existant réemployés, pas de nouvelle
file ou de score envoyé par le client. Supabase : privilèges/RLS et transactions
revus avec la [documentation des triggers](https://supabase.com/docs/guides/database/postgres/triggers).
Non déployé, aucune migration durable/activation/build global. Restent la recette
intégrée au SHA propre, la publication et le raccordement effectif S-048.
