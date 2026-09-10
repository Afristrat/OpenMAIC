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
SSE thinking expose cohorte, motif, effectif et score ; décision structurée
actualisée. Ce n’est pas encore une restitution UI ni un registre A/B durable.

## Protocole préalable

- Clé SHA-256 v1 serveur : tuple JSON [actorId, orgId, stageId], préfixe
  qalem-director-v1:. Unité apprenant/tenant/formation stable entre requêtes,
  remplaçant l’ancienne proposition de session serveur. Répartition attendue
  50/50, aucun quota garanti sur un petit effectif.
- Contrôle : classique sans lecture. Traitement : suggestion compatible ou
  fallback, sans changement de cohorte. END/USER/agent explicite/plafond ne
  sont pas des expositions ; distinguer assignation et exposition réelle.
- Population : comptes authentifiés, tenant et formation valides. Mesure
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

Restent restitution UI, registre consenti assignation/exposition et mesures
par cohorte, recette intégrée S-047/navigateur, gate complet et activation.
S-048 reste ouverte, passes=false. Aucun gain mesuré.
