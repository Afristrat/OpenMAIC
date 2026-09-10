# S-048 — Director raccordé, activation en attente

## État vérifié le 10 septembre 2026

Le nœud réel directorNode appelle observeDirectorChoice. Acteur et tenant
proviennent du contexte authentifié du chat ; langue et premier sujet du cours
prêt persisté. Recherche limitée à la formation courante, puis RPC S-047
recontrôlant droits, partage, consentement et reçu quiz natif complet.
Aucun minimum ; zéro utilisable. Erreur, absence ou incompatibilité : classique.

Le choix observé est borné aux agents autorisés pour la forme et le déclencheur
classiques. END, USER, premier agent explicite et plafond de tours restent
prioritaires. La constitution andragogique n’est pas remplacée.
SSE thinking expose cohorte, motif, effectif, score et nom de l’agent retenu ;
décision structurée actualisée. L’onglet Chat affiche le dernier choix, son
effectif et son score localisés, ainsi que la limite observationnelle, ou le
groupe classique/fallback. État React temporaire borné à un choix, filtré par
formation/tenant/session, remplacé au prochain choix ; pas de copie dans les
messages persistés. Un registre serveur candidat est désormais raccordé au
graphe ; sa migration n’est pas appliquée durablement.

## Protocole préalable

- Clé SHA-256 v1 serveur : tuple JSON [actorId, orgId, stageId], préfixe
  qalem-director-v1:. Unité apprenant/tenant/formation stable entre requêtes,
  remplaçant l’ancienne proposition de session serveur. Répartition attendue
  50/50, aucun quota garanti sur un petit effectif.
- Contrôle : classique sans lecture. Traitement : suggestion compatible ou
  fallback, sans changement de cohorte. END/USER/agent explicite/plafond ne
  sont pas des expositions ; distinguer assignation et exposition réelle.
- Population mesurée : comptes authentifiés ayant consenti à la collecte,
  tenant et formation valides. Mesure
  principale prévue : premier score quiz natif associé selon S-047, comparé
  par cohorte assignée avec effectifs, scores manquants et taux d’exposition.
  Ne pas retenir uniquement les suggestions appliquées.
- Secondaires prévues : taux de fallback, erreurs et délai supplémentaire.
  Comparer par formation/langue. Aucun minimum pour proposer ou présenter,
  effectifs toujours explicites, aucune corrélation qualifiée de gain causal.
- Arrêt par désactivation en cas d’écart de droits, de constitution ou de
  régression. Retrait du consentement exclut les sources via S-047.
- Flag QALEM_DATA_DIRECTOR_ENABLED explicitement true requis, exemple false.
  Aucune configuration exécutée modifiée. Activation après recette intégrée
  et jalon humain requis par le PRD.

## Preuves et reste

ServeurIA 66609 exit 0 : quinze tests ciblés, TypeScript/lint.
56375 exit 0 : seize tests, TypeScript/lint, avec constitution réelle pour
refus d’agent, sélection autorisée et retour de parole. Modèle et sources
simulés, nœud réel exécuté. Module : zéro/une/plusieurs observations, score
nul, erreurs et cohortes déterministes. Pas de navigateur ni build global,
runner antérieur avec superposition, pas de gate intégré au SHA propre.
Aucune migration durable, activation ou publication.

10 septembre, restitution UI : 43799 valide dix-neuf tests, TypeScript et lint.
Son navigateur échoue sur un sélecteur ambigu après ajout du nom dans l’encart.
Sélecteur ciblé exactement, puis 40555 exit 0 : format et deux Chromium sans
retry, groupe classique et une observation à score zéro ; bascule EN/FR/AR
avec RTL et avertissement visible. SSE, voix et HTTP simulés : parcours UI
réel, pas une preuve de collecte/effet en production. 85946 avait détecté le
nom technique affiché ; corrigé à la source par le nom fourni dans le SSE.
Trois tests de restitution couvrent aussi fallback et nombres invalides.

## Registre serveur candidat — 10 septembre

Migration CLI 20260910045739, table privée director_receipts, RLS et droits
réservés au service. Chaque décision éligible reçoit un UUID serveur, rattaché
au pseudonyme révocable. La cohorte SQL reproduit la clé JavaScript canonique
(UUID en minuscules). Consentement/epoch verrouillés, stage/scène/agent et
tenant/source/partage vérifiés. Réservation avant lecture, sélection immuable,
puis génération completed/empty/failed/aborted distincte. L’absence de retour
de génération reste inconnue, jamais transformée en succès. Un contenu généré
ne prouve ni sa réception ni son écoute par l’apprenant.

Le message réel utilise assistant-UUID-du-reçu : liaison S-047 désormais
implémentée dans la candidate 20260910051111 ci-dessous. Rejeux ne remplacent pas les choix ; retrait
supprime les reçus via la cascade existante, réaccord ne les ressuscite pas.
Export personnel paginé raccordé, sans pseudonyme ni epoch. Échec de collecte :
avertissement technique, parcours conservé, aucun succès inventé. lookup_ms
mesure seulement la recherche/sélection observée, pas toute la latence du chat.
Les reçus sont par décision ; la comparaison agrège désormais par unité assignée,
pas traiter les tours d’un même apprenant comme des individus indépendants.

52266 exit 0 : seize tests/TypeScript/lint. 5580 exit 0 : trente tests,
TypeScript/lint et quatre Chromium d’export (FR/AR/EN RTL et indisponibilité).
Graphe réel testé avec génération simulée réussie/échouée et identifiant du
reçu dans le message. SQL service_role sous BEGIN/ROLLBACK : refus, rejeux,
choix/génération immuables, zéro, deux vecteurs de cohorte comparés au SHA Node,
refus de contamination du contrôle, export isolé, retrait sans toucher l’autre
compte et absence de résurrection. Candidate absente et zéro compte de recette
relus après annulation. Première recette interrompue par un prérequis quiz
omis ; ajout du fichier de migration réel, aucune mutation durable.
Advisor CLI local indisponible (54322 refusé) ; pas de certification advisor.
Documentation consultée : [fonctions Supabase](https://supabase.com/docs/guides/database/functions)
et [changelog](https://supabase.com/changelog). Aucun upgrade d’infrastructure.

## Liaison et rapport candidat — 10 septembre

Candidate CLI 20260910051111 : trigger après réception d’une discussion,
correspondance exacte message/agent/compte/tenant/formation/scène/epoch et
génération antérieure. Aucun backfill ni réaffectation d’un reçu déjà lié.
Le résultat déclaré par le navigateur reste une déclaration, pas une preuve
d’écoute. Suppression de la discussion ou retrait : cascade des reçus associés.

RPC service seule read_director_experiment et GET
/api/organizations/[orgId]/director-experiment?stageId=… : administrateur ou
manager actuel, tenant/source actifs et partage vérifié, identité Auth serveur,
réponse sans cache ni identité apprenante, délai cinq secondes. Une panne donne
503, jamais un rapport vide présenté comme réussi.

Une unité par apprenant/tenant/formation ; comptages de décisions séparés.
Première soumission native liée parmi les données conservées, y compris si
sa correction attend encore : une tentative ultérieure complète ne la remplace
pas. Après suppression d’une tentative, le calcul porte sur le premier reçu
restant ; ce rapport n’est pas une archive immuable. Moyenne des scores connus,
effectifs avec/sans score toujours joints, zéro distinct de null. Aucun minimum.
Langue inconnue ou mixte séparée ; différence traitement moins contrôle
uniquement à langue identique, descriptive et non causale. Compteurs de choix,
génération, tours déclarés et délai de recherche disponibles sans assimiler
la génération à une exposition écoutée.

67326 exit 0 : quatre tests API/rapport, TypeScript/lint. 51432 exit 0 :
37 tests ciblés (rapport, Director et export), TypeScript/lint. SQL réel service_role
sous BEGIN/ROLLBACK, puis recette renforcée : groupe classique à 100 %, traitement
à zéro, deux participants dont un sans quiz, plusieurs décisions non dédoublées
en participants, première correction en attente, refus autre compte/scène/reçu
inachevé, association immuable, refus de lecture apprenant ou formation étrangère,
export et retrait. Candidate absente et zéro compte synthétique relus après
ROLLBACK. Aucun changement durable. Advisors local toujours indisponible sur
127.0.0.1:54322 ; aucune certification advisor. Documentation :
[triggers Supabase](https://supabase.com/docs/guides/database/postgres/triggers).

## Rapport dans l’interface — 10 septembre

Action par formation dans le rapport organisationnel existant, tableau FR/AR/EN
avec nom de formation, groupes/langues, participants avec et sans score,
compteurs de décisions/générations/tours et délai de recherche. Différence
des moyennes en points de pourcentage, jamais qualifiée de gain. Aucun minimum.
Périmètre toutes données conservées explicite, indépendant des dates du rapport
général ; non inclus dans ses exports CSV/PDF. Droits admin/manager expliqués.

Actualisation explicite, état de chargement, vide, refus ou erreur distincts.
Changement de tenant/formation démonte le composant et annule sa requête ; pas
de réponse ancienne réutilisée dans un nouveau périmètre. Schéma partagé et
version/unité/résultat attendus validés avant affichage, différences recalculées
à partir des agrégats validés. Pas de données persistées dans le navigateur.
Ponytail : composants, fetch, AbortController et Intl existants, aucune dépendance.

23245 exit 0 : TypeScript/lint et trois Chromium FR/AR/EN RTL, zéro/absence,
plusieurs décisions, changement de formation et refus. APIs simulées.
79154 exit 0 : quatre tests API/rapport, TypeScript/lint et huit Chromium sans
retry : trois Director FR/AR/EN RTL avec actualisation/réponse invalide/vide/refus,
cinq parcours de non-régression du rapport existant. Aucun processus actif.

Restent recette intégrée S-047/S-048 sur données serveur, gate complet au SHA
propre et activation contrôlée. Runner antérieur avec superposition, aucune publication.
S-048 reste ouverte, passes=false. Aucun gain mesuré.
