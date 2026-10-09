# WP9 — Activation par tenant et télémétrie

Date : 2026-10-09
Branche : `feature/adaptive-design-system`

## Comportement livré dans le code

- L’administrateur du tenant peut activer ou désactiver `design_system_v1`
  depuis l’administration de son organisation. Le réglage absent ou faux garde
  la branche historique du générateur.
- La télémétrie persistée enregistre les appels LLM des scènes, longueur des
  prompts, latence, jetons observés, coût valorisé par devise, statut de mesure,
  règles du linter, corrections de charte et replis géométriques. Aucun texte de
  prompt, nom de scène, contenu pédagogique ou identifiant d’apprenant n’est
  enregistré.
- Les coûts proviennent de `valued_billable_usage.cost_microunits` et sont
  exprimés dans la devise de facturation du tenant après conversion, pas dans la
  devise native du fournisseur. Les appels non valorisés restent non mesurés.
- Les lignes sont isolées par organisation, protégées par RLS et accessibles
  uniquement via une route exigeant une session et le rôle d’administrateur du
  tenant ou de super-administrateur. Les lectures couvrent au plus 90 jours et
  5 000 événements ; la réponse signale la troncature.
- La page affiche le volume, les règles déclenchées, le taux de repli, la longueur
  moyenne des prompts, la latence, le coût par devise et le coût moyen par scène.
  Un tarif manquant est montré comme non mesuré, jamais comme zéro.

## Retour arrière

1. Désactiver immédiatement le réglage pour un tenant depuis son administration
   ou via `PATCH /api/organizations/{orgId}/brand-system` avec
   `designSystemEnabled: false`. Les stages existants conservent leur snapshot ;
   la désactivation concerne les nouvelles générations.
2. Si l’activation produit une régression globale, redéployer le commit précédent
   sur la branche de travail et laisser la migration additive en place. Le code
   précédent ignore la table ; il n’y a aucune migration destructive.
3. La table ne doit pas être supprimée pour faire le rollback : elle est
   append-only côté application, RLS activée, sans accès utilisateur direct et
   supprimée automatiquement avec le tenant.

## État de validation

ServeurIA au SHA `2850bfac` : Prettier, TypeScript et ESLint passent ; 30 tests
ciblés passent. La suite complète passe avec 559 fichiers et 3 462 tests. Le
build de production passe. La première exécution E2E s’est terminée à 201/202 :
le scénario du widget publié en français a échoué sur un conflit IndexedDB, puis
a passé seul. Une nouvelle exécution de la suite en quatre shards a ensuite
passé les 202 tests avec codes de sortie 0 : 51 + 51 + 50 + 50 ; le scénario
français inclus dans le troisième shard passe. Le défaut intermittent n’a pas
été reproduit. Une tentative monolithique ultérieure a affiché 202 réussites,
mais le broker a coupé le processus à 300 secondes ; elle n’est pas retenue.

Aucun tenant n’a été activé, aucune migration n’a été appliquée en production,
aucune génération réelle n’a été lancée et aucun redéploiement n’a été demandé.
