# S6-022 — Provisionnement des tenants, rôles et sièges

## Verdict

S6-022 est certifiée au SHA `2cf11cd989c8f47ebd84cf8b4ffc8f1e31262eec`. Seul un super-administrateur authentifié peut provisionner un tenant. Le statut, le plafond de sièges, les invitations nominatives et les rôles sont contrôlés côté serveur et audités.

## Contrat persistant

- Les migrations `00049_tenant_provisioning.sql` à `00052_redact_invitation_tokens_from_audit.sql` sont appliquées à la base Qalem.
- Le plafond est un entier strictement positif. Membres et invitations nominatives actives occupent un siège commun.
- Les insertions concurrentes sont sérialisées par verrou sur le tenant ; un dépassement ou une baisse sous l’occupation courante échoue dans la transaction.
- La consommation d’une invitation libère sa réservation avant l’insertion du membre dans la même transaction.
- Un tenant suspendu conserve ses données, mais ses membres et nouvelles invitations sont refusés par les contrôles serveur.
- L’audit reste présent après la suppression éventuelle du tenant. Les jetons d’invitation sont expurgés de tous les instantanés d’audit.
- La table d’audit a RLS activée et reste inaccessible aux rôles `anon` et `authenticated`.

## Production

- Déploiement Coolify : `euk21siw1rwqwz19hndvqona`, terminé sur le SHA exact.
- Conteneur : `bcx5pxyuc9z3lt4jtyjipcqu-142317288006`, sain, image `bcx5pxyuc9z3lt4jtyjipcqu:2cf11cd989c8f47ebd84cf8b4ffc8f1e31262eec`.
- La migration d’expurgation a été réappliquée sous le propriétaire PostgreSQL effectif `supabase_admin` et validée dans une transaction annulée : une invitation produit exactement un audit sans champ `token`.

La recette réelle a provisionné un tenant temporaire de trois sièges, puis inscrit un administrateur, un gestionnaire et un auteur depuis trois invitations nominatives. Le quatrième siège, la baisse du plafond à deux et une invitation après suspension ont été refusés. Onze événements d’audit ont été produits sans aucun jeton. Le tenant, les audits et les trois identités temporaires ont ensuite été supprimés ; les recomptages ciblés ne trouvent aucun résidu.

## Interface

Le panneau d’administration permet de créer un tenant avec son secteur, sa langue, son plafond et l’adresse de son premier administrateur, puis de consulter l’occupation, modifier le plafond, suspendre et réactiver. Les parcours permanents couvrent le français et l’arabe RTL.

## Gate complet

Exécuté sur ServeurIA au SHA exact :

- formatage, TypeScript et lint : verts ;
- Vitest : 390 fichiers, 2 523 tests réussis ;
- build : 101 pages statiques générées, build de production réussi ;
- Playwright : 88 tests réussis en 3,8 minutes.

Journal : `/tmp/qalem-gate-logs/s6022-2cf11cd-full-gate.log`  
SHA-256 : `6ddeed6c7290c793b017a4a506f15ad6b95674e08315632df5d5cda14c1b3c8d`
