# U-007 — Bouton certificat dans la classroom

## Verdict

U-007 est certifiée au SHA fonctionnel `f82f3927413a0177cc549865efd9411e643edac0`, poussé sur `origin/refork-v030` et déployé en production le 2 septembre 2026. Un bénéficiaire ayant terminé tous les quiz d’un cours persistant peut ouvrir la page de fin, émettre son certificat, le retrouver après navigation dans « Mes certificats » et ouvrir sa vérification publique.

## Correction livrée

- `CertificatePrompt` est monté sur la page de fin de la classroom avec l’identifiant réel du cours et le résultat des quiz réellement complétés.
- L’interface et l’API partagent la même règle d’éligibilité : au moins un quiz complété et une moyenne supérieure ou égale à 60 %.
- Le contrat JSON réel de `/api/certificates/generate` est consommé sans enveloppe fictive.
- Une concurrence sur l’index unique utilisateur/cours relit le certificat gagnant et répond de façon idempotente au lieu de produire une erreur 500.
- Le snapshot d’une classroom persistée expose désormais `generationComplete: true`, et le client restaure ce signal. La première recette production avait révélé que le chemin serveur réinitialisait ce drapeau et rendait la page de fin inaccessible, alors que le chemin IndexedDB des anciens tests restait vert.

## Preuves automatisées

La preuve rouge du chemin serveur a été obtenue aux SHA `d29e7cf071bcca6cec4c3ff9f833f252163cc624` puis `e74d5ffb3b51bab4544a5d054b3c96e7761015ab` : Chromium attendait « Course complete » jusqu’au timeout. Après la correction, le même scénario réussit au SHA `f82f3927413a0177cc549865efd9411e643edac0`.

Le gate complet a été exécuté sur ServeurIA dans `qalem-validation:playwright-1.58.2-ffmpeg`, sur le checkout détaché exact :

| Contrôle | Résultat |
|---|---:|
| Prettier | vert |
| TypeScript `tsc --noEmit` | 0 erreur |
| ESLint | 0 erreur et 0 avertissement |
| Vitest | 409/409 fichiers, 2 595/2 595 tests |
| Build Next.js | 103/103 pages |
| Playwright Chromium | 92/92 scénarios, 5,0 min |

Les tests permanents couvrent notamment l’émission initiale, le rejeu, la course concurrente, le refus anonyme, le refus d’un utilisateur hors droits, l’absence de bouton sans quiz et le chargement d’une classroom serveur sans snapshot IndexedDB préalable.

## Déploiement

- Application Coolify : `bcx5pxyuc9z3lt4jtyjipcqu` (`qalem-web-rolling-candidate`).
- Déploiement : `gh853y7iazoe466izp1kkfk8`, terminé au SHA exact.
- Conteneur : `bcx5pxyuc9z3lt4jtyjipcqu-172952217823`.
- Image : `bcx5pxyuc9z3lt4jtyjipcqu:f82f3927413a0177cc549865efd9411e643edac0`.
- État après basculement : `healthy`, `RestartCount=0`, `OOMKilled=false`.
- `https://qalem.ma/api/health` répond 200.

Le runtime Qalem, ses workers, LiteLLM et Hostinger n’ont pas été redéployés : U-007 ne modifie que l’application web.

## Recette de production

La recette a créé un tenant, un bénéficiaire, un utilisateur extérieur, un cours persistant avec un quiz et un résultat à 100 %, tous strictement temporaires. Chromium headless a parcouru `https://qalem.ma` sans mock :

1. connexion du bénéficiaire et chargement de la classroom serveur : 200 ;
2. ouverture de « Course complete » et présence de « Get certificate » ;
3. émission initiale : 201 ;
4. deux replays : 200 et `alreadyExisted=true`, avec le même identifiant de certificat ;
5. rechargement de `/certificates`, certificat visible et fenêtre de consultation rouverte ;
6. vérification publique visible ;
7. tentative de l’utilisateur extérieur : 404 ;
8. tentative anonyme : 401.

## Nettoyage

Après la recette, les compteurs de contrôle sont tous revenus à zéro pour les stages, scènes, résultats de quiz, certificats, organisations, adhésions et profils. Les deux comptes Auth temporaires répondent 404. Les scripts et fichiers de recette ont été supprimés du serveur, du conteneur et du poste local.

