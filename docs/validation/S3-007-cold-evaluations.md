# S3-007 — Évaluations à froid J+30 et J+60

Date de certification : 2026-09-06
Commit fonctionnel : `512d86eeacef74689e61f2d7039564a0d1e192c6`

## Verdict

S3-007 est certifiée de bout en bout en production. Le plan crée exactement deux livraisons `cold_eval`, respectivement à J+30 et J+60. Les deux rappels aboutissent à leur phase propre, les réponses sont persistées avec leur score et l’unicité par session, apprenant et phase rejette un second envoi.

## Défaut corrigé

La route d’évaluation vérifiait l’appartenance du rappel et sa phase, mais pas son émission effective. Une personne connaissant l’URL pouvait donc soumettre l’évaluation avant l’échéance. La route sélectionne désormais `sent_at` et répond 409 tant que le worker n’a pas livré le rappel.

Le test `tests/api/anchor-delivery-evaluation-route.test.ts` prouve les deux frontières : refus avant émission, puis création unique après émission avec rejet du doublon.

## Recette production

Une session authentifiée, enregistrée et terminée, son tenant et douze graines ont été créés temporairement. L’activation du flag `anchoring` n’a duré que le temps de l’opt-in, puis sa valeur initiale a été restaurée.

- L’opt-in répond 201 et crée 14 livraisons.
- Les deux livraisons froides portent les phases `cold_30` et `cold_60` ; les écarts à `opted_in_at` sont exactement de 30 et 60 jours.
- Une soumission `cold_30` avant émission répond 409 et ne crée aucune évaluation.
- Les deux jobs ont ensuite été accélérés de façon contrôlée afin de compresser le temps de recette, sans modifier les échéances persistées.
- Le worker envoie deux Push chiffrés vers une terminaison HTTPS externe ; les deux requêtes sont acceptées en HTTP 200 et les deux cibles contiennent le plan, la livraison et la phase exacts.
- Les formulaires réels J+30 et J+60 enregistrent respectivement les scores 90 et 70. Les deux livraisons sont marquées ouvertes.
- Une seconde soumission J+30 répond 409 ; seules deux lignes d’évaluation subsistent avant nettoyage.

Le compte Auth, le tenant, le stage, le plan, les évaluations, l’abonnement Push, la terminaison externe et les fichiers temporaires ont été supprimés. Les cinq compteurs de données contrôlés sont à zéro ; le compte Auth et la terminaison répondent 404.

## Quality gate et runtime

Le gate complet a été exécuté dans un clone ServeurIA isolé du SHA exact avec `NODE_OPTIONS=--max-old-space-size=8192` : Prettier, TypeScript, ESLint, suite Vitest complète et build Next.js verts ; 112 tests Playwright réussis sans retry. Le test ciblé ajouté réussit ses deux cas.

Déploiements Coolify : web `wdq5jn630hvujzijvpzb236b`, runtime `kvr9nnp9e2fcc4qm6812xf2l`. Les conteneurs web `bcx5pxyuc9z3lt4jtyjipcqu-130010145299` et worker `qalem-workers-a14gf0n3u719hnnd2yujrtmr-130103521508` exécutent le SHA exact, sont sains, comptent zéro redémarrage et `OOMKilled=false`. La santé publique répond HTTP 200.
