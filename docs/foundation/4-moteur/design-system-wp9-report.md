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

Ce document décrit l’implémentation du code courant, pas un déploiement. La
migration, l’API, l’interface et la télémétrie doivent encore passer la gate
ServeurIA au SHA livré. Aucun tenant n’a été activé et aucune génération réelle
n’a été lancée pour cette recette.
