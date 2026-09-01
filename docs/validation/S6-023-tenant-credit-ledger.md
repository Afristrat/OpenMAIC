# S6-023 — Portefeuille et ledger de crédits

## Verdict

S6-023 est certifiée au SHA `9ce8a4635f47ec1498b9808e09459a66711b3186`. Chaque tenant dispose d’un solde en millionièmes de crédit et d’un ledger immuable. Toute mutation exige un acteur existant, un motif et une clé d’idempotence.

## Contrat persistant

- Les migrations `00053_tenant_credit_ledger.sql` et `00054_tenant_credit_privileges.sql` sont appliquées à la base Qalem.
- Le solde mis en cache doit toujours égaler la somme des écritures ; toute divergence bloque lecture et mutation.
- PostgreSQL verrouille le portefeuille du tenant avant idempotence, rapprochement et mutation.
- Les allocations sont positives ; les corrections sont signées ; les débits exigent une unité, une quantité et une référence d’usage ; un remboursement restitue exactement le débit désigné et ne peut exister qu’une fois.
- Les unités couvrent les jetons LLM entrants et sortants, la synthèse vocale, la transcription, l’image, la vidéo, le stockage et les opérations génériques.
- Les montants sont des entiers au millionième de crédit et les quantités sont limitées à six décimales.
- Les administrateurs et gestionnaires du tenant ont uniquement `SELECT` sur leur portefeuille et leur historique RLS. `authenticated` n’a aucun privilège brut d’insertion, modification ou suppression.
- Les mutations passent exclusivement par les RPC du rôle de service. Même ce rôle ne peut réécrire ni supprimer directement une écriture ; seule la suppression en cascade du tenant peut supprimer son ledger complet.

## Concurrence et isolation

Une recette réellement concurrente a lancé deux débits de 0,75 crédit sur un solde de 1 : exactement un débit a réussi, l’autre a été refusé par `INSUFFICIENT_TENANT_CREDITS`. Le solde final était 0,25, avec une seule écriture de débit et un rapprochement vrai. Le tenant temporaire et ses audits ont été supprimés, sans résidu.

Une transaction RLS à deux tenants a confirmé qu’un administrateur voit un portefeuille et une écriture — les siens — malgré la présence d’un second tenant. Une insertion directe sous le rôle `authenticated` a été refusée. Les privilèges effectifs relus sont `SELECT=true` et `INSERT=false`.

## Production

- Déploiement Coolify : `npxe5bj41o6idx8uv96bd9bz`, terminé sur le SHA exact.
- Conteneur : `bcx5pxyuc9z3lt4jtyjipcqu-151239730731`, sain, image `bcx5pxyuc9z3lt4jtyjipcqu:9ce8a4635f47ec1498b9808e09459a66711b3186`.

La recette finale a créé un tenant et son administrateur invité, puis validé : allocation de 10 crédits, retry sans doublon, débit de 3, retry sans second débit, refus d’un débit de 8, remboursement exact du débit, retry sans second remboursement et correction administrative ramenant le solde à 9. L’API authentifiée du tenant a répondu avec le solde 9 et quatre écritures ; la lecture RLS ne contenait que ces quatre écritures. Le rapprochement était vrai. Tenant, identité, audit, portefeuille et ledger ont été supprimés ; le contrôle final ne trouve aucun résidu.

## Interface

Le super-administrateur peut allouer ou corriger les crédits depuis la fiche du tenant avec un motif obligatoire. Les administrateurs du tenant consultent leur solde et les cent dernières écritures autorisées. Les libellés sont fournis en français, anglais et arabe ; le parcours d’administration reste couvert en RTL.

## Gate complet

Exécuté sur ServeurIA au SHA exact :

- formatage, TypeScript et lint : verts ;
- Vitest : 395 fichiers, 2 539 tests réussis ;
- build : 102 pages statiques générées, build de production réussi ;
- Playwright : 88 tests réussis en 4,0 minutes.

Journal : `/tmp/qalem-gate-logs/s6023-9ce8a46-full-gate.log`  
SHA-256 : `fa121fb87ee76f11062db179cba3d6fec5fde3d39b13bfa39d9dcf6fc022d50c`
