# Rapport WP2 — Instantané de charte du tenant

Date : 2026-10-09  
Branche : `feature/adaptive-design-system`  
Base : `refork-v030` à `b416c7f162457fe8938c8deebf25882924746621`  
SHA validé et poussé : `d449c48af2d2133c2145bfa592f15e7e287a491e`

## Résultat

La charte présente dans `organizations.settings.brandDesignSystem` est
sérialisée par du code déterministe, sans appel à un modèle, puis figée une
fois à la création du cours dans `stages.extra`. L’instantané persiste sa
version, son horodatage et son texte compact. La valeur créée est réutilisée
pour chaque slide, chaque scène interactive et chaque régénération de slide.
Une modification ultérieure de la charte du tenant ne réécrit donc pas les
cours déjà créés.

- La sérialisation exclut les URL, dates d’extraction et éléments inférés ; elle
  conserve les rôles de couleur, les trois rôles typographiques, les éléments à
  éviter, la logique de mise en page, la signature, les formes et le rythme.
- Les polices hors catalogue sont déterministement rapprochées d’une police
  autorisée et l’écart est journalisé.
- Les rôles de premier plan sont corrigés si leur contraste avec les surfaces
  courantes est inférieur à 4,5:1 ; les corrections et couleurs invalides sont
  journalisées.
- Les champs textuels sont nettoyés et bornés ; le texte injecté dans le prompt
  est limité à 1 200 caractères et explicitement traité comme donnée de marque,
  sans autorité sur les règles de sécurité, d’accessibilité ou le schéma.
- Sans charte, aucun instantané de marque n’est fabriqué ; le repli neutre de la
  directive WP1 reste disponible.

## Validation

Sur ServeurIA, dans le clone temporaire isolé de la branche, au SHA indiqué :

- compilation du paquet DSL, Prettier, TypeScript, ESLint : réussis ;
- tests ciblés de sérialisation : 5/5 réussis, couvrant déterminisme, exclusion
  des métadonnées, polices, contraste, cinq chartes volumineuses et couleurs
  invalides ;
- suite Vitest complète et build de production : code de sortie 0 ;
- Playwright : quatre shards, 51 + 51 + 50 + 50, soit 202 tests réussis.

La première exécution Playwright monolithique a affiché 202 réussites, mais le
broker a interrompu la fermeture du processus à sa limite de 300 secondes. Le
résultat n’a pas été compté comme une preuve. Les quatre shards rejoués ensuite
ont chacun rendu un code de sortie 0.

## Limites de cette livraison

Aucune génération réelle, consommation de quota, modification de tenant,
activation de flag ou mise en production n’a été effectuée. La charte n’est
appliquée qu’aux organisations dont
`settings.features.design_system_v1 === true`. L’action d’administration
« resynchroniser la charte » n’est pas présente ; la resynchronisation manuelle
d’un cours existant reste une suite documentée, afin de ne pas écraser son
identité figée sans action explicite de l’auteur.

Les contrôles de contraste couvrent les rôles de premier plan contre les
surfaces de fond déclarées usuelles ; ils ne constituent pas encore un audit
pixel par pixel des slides rendues. La vérification visuelle réelle et le
déploiement restent des étapes distinctes.
