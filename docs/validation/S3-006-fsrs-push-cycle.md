# S3-006 — Cycle FSRS complet depuis un rappel Web Push

Date de certification : 2026-09-06
Commit fonctionnel : `ce051179677d0933ec23cc08ba28b8d530989c17`

## Résultat

L’US est certifiée de bout en bout en production. Les réponses de quiz alimentent la file `review_cards` existante, les rappels ciblent ces mêmes cartes et la notation du rappel met à jour leur état FSRS. Aucun moteur de répétition parallèle n’a été introduit.

## Correction livrée

La recette a révélé une course asynchrone : l’écran de résultat apparaissait avant la fin de `persistQuizCompletion`, de sorte qu’une fermeture immédiate pouvait perdre la création serveur de la carte. `components/scene-renderers/quiz-view.tsx` attend désormais cette persistance avant d’exposer le résultat. Le test navigateur `e2e/tests/quiz-content-surface-657.spec.ts` bloque volontairement l’écriture `review_cards`, vérifie que le résultat reste masqué, puis confirme son apparition après la réponse serveur.

## Recette production authentifiée

- Une réponse incorrecte au quiz réel crée exactement une carte due dans `review_cards`, avec trois identifiants source et `reps = 0`.
- Un plan d’ancrage produit 14 livraisons ; une livraison `quiz_reminder` est reliée à cette carte.
- Pendant la pause, le job BullMQ arrivé à échéance reste non envoyé, sans tentative.
- Après reprise, le worker envoie le Web Push vers une terminaison HTTPS contrôlée, acceptée en HTTP 201, avec la cible exacte `/review?card=…&delivery=…`.
- Le parcours de révision ouvre la bonne question ; la notation « Bien » fait passer `reps` de 0 à 1, avance l’échéance et la stabilité, renseigne `last_review` et marque la livraison comme ouverte.
- Le flag `anchoring` a été restauré à `false`. Compte Auth, tenant, formation, session, plan, carte, abonnement Push, terminaison externe et fichiers temporaires ont été supprimés ; les compteurs de contrôle sont revenus à zéro.

## Limite Bloom

La limite consistant à dériver les questions de rappel des quiz existants, sans générateur dédié de transfert entre niveaux de Bloom, reste explicitement consignée dans `docs/foundation/3-ancrer/09-errors-log.md` et `docs/foundation/3-ancrer/04-feature-backlog.md`. Elle ne crée pas un second moteur FSRS et ne bloque pas le contrat de cette US.

## Quality gate et déploiement

Le gate complet a été exécuté sur ServeurIA dans un clone isolé du commit exact :

- Prettier, TypeScript et ESLint : verts ;
- Vitest : 436 fichiers, 2 686 tests réussis ;
- build Next.js : 112 routes générées ;
- Playwright : 112 tests réussis, sans retry.

Déploiements Coolify : web `xcnelrzngl04500818qsa4mr`, runtime `cmq4yf2ytjn1ukfeqxcaanii`. Les deux déploiements sont terminés sur le SHA exact. Le conteneur web `bcx5pxyuc9z3lt4jtyjipcqu-124511872291` et le worker `qalem-workers-a14gf0n3u719hnnd2yujrtmr-124639269889` sont sains, avec zéro redémarrage et `OOMKilled=false`. `https://qalem.ma/api/health` répond HTTP 200.
