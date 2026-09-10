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

Le message réel utilise assistant-UUID-du-reçu : point de liaison pour S-047,
pas encore une association en base. Rejeux ne remplacent pas les choix ; retrait
supprime les reçus via la cascade existante, réaccord ne les ressuscite pas.
Export personnel paginé raccordé, sans pseudonyme ni epoch. Échec de collecte :
avertissement technique, parcours conservé, aucun succès inventé. lookup_ms
mesure seulement la recherche/sélection observée, pas toute la latence du chat.
Les reçus sont par décision ; la comparaison devra agréger par unité assignée,
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

Restent liaison des reçus aux discussions/quiz S-047, mesures et comparaison
par cohorte, recette intégrée, gate complet au SHA propre et activation.
S-048 reste ouverte, passes=false. Aucun gain mesuré.
