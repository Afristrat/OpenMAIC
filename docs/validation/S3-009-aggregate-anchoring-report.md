# S3-009 — Reporting d’ancrage agrégé par organisation

## Verdict

S3-009 est certifiée au SHA fonctionnel `140a37f99c7a8ab3bf6f9c1c2fcb1478de95a4f8`, poussé sur `origin/refork-v030` et déployé en production le 6 septembre 2026. Le reporting expose les indicateurs d’ancrage et les agrégats par formation, sans ligne, profil, pseudonyme ni identifiant d’apprenant.

## Correction de la frontière de confidentialité

- L’API institutionnelle ne renvoie plus `learners` ni `pagination` dans son JSON.
- Les exports CSV et PDF ne contiennent plus de tableau individuel.
- La page organisation ne rend plus de tableau d’apprenants.
- Les requêtes internes sélectionnent uniquement les colonnes nécessaires au calcul des agrégats. Une organisation sans formation produit des ensembles vides au lieu de requêtes non bornées.
- Le contrôle d’adhésion et de rôle reste exclusivement côté serveur. Un utilisateur extérieur à l’organisation reçoit 403 avant toute lecture métier.

## Gate exact sur ServeurIA

Le checkout isolé `/tmp/qalem-s3009-140a37f` a exécuté le gate du SHA exact :

| Contrôle | Résultat |
|---|---:|
| Prettier | vert |
| TypeScript | 0 erreur |
| ESLint | 0 erreur et 0 avertissement |
| Vitest | 436/436 fichiers, 2 686/2 686 tests |
| Build Next.js | 112 routes |
| Playwright Chromium | 111/111 scénarios, sans retry |

Les tests ciblés ajoutés passent également : 5/5 contrôles API/PDF et 1/1 parcours Chromium. Ils vérifient le refus inter-tenant, l’absence de données individuelles dans JSON, CSV et PDF, ainsi que l’affichage de la participation, du chaud/froid, de la rétention et du taux d’ouverture.

Un premier passage global avait atteint 110/111 à cause d’un timeout de la fixture IndexedDB d’un ancien scénario de menus. Ce scénario a repassé seul sans retry en 4,1 s, puis le passage global frais suivant a réussi 111/111 sans retry. Seul ce dernier passage constitue la preuve finale.

## Déploiement et recette de production

- Déploiement Coolify : `tery04pgnhstod8zx0ug8ohe`, terminé sur le SHA fonctionnel exact.
- Conteneur : `bcx5pxyuc9z3lt4jtyjipcqu-113137627100`.
- Image : `bcx5pxyuc9z3lt4jtyjipcqu:140a37f99c7a8ab3bf6f9c1c2fcb1478de95a4f8`.
- État : `healthy`, `RestartCount=0`, `OOMKilled=false` ; `/api/health` répond 200.

La recette authentifiée a créé deux organisations temporaires avec des scores volontairement différents. Pour l’organisation A, l’interface réelle de `qalem.ma` a affiché : participation 100 %, chaud 80 %, froid J+30 70 %, écart J+60 −20 points et ouverture 50 %. Le JSON, le CSV et l’interface ne contenaient ni identifiant, ni pseudonyme, ni marqueur individuel. L’accès du gestionnaire A au rapport d’ancrage de l’organisation B a répondu 403.

## Nettoyage

Les deux organisations, les deux comptes Auth et leurs audits temporaires ont été supprimés. Les recomptages finaux trouvent zéro organisation, zéro profil et zéro audit résiduel. Les fichiers temporaires de credentials ont été supprimés du conteneur web, du conteneur de validation et de l’hôte ServeurIA.
