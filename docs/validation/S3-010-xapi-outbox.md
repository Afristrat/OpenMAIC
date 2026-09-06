# S3-010 — Émission xAPI via outbox

Date de certification : 2026-09-06
Commit fonctionnel : `01ac44b549f14cf3221b6649abd87ede9747dc1d`

## Verdict

S3-010 est certifiée de bout en bout en production. Qalem émet par une outbox durable les cinq événements exigés par le protocole P3-C : session vécue, quiz répondu, évaluation à chaud, évaluation à froid et graine ouverte. Une indisponibilité du LRS conserve l’événement en échec, puis le worker le réémet après reconnexion. L’acteur est pseudonymisé et ne contient ni nom ni adresse électronique réelle.

## Contrat livré

- `lib/anchoring/xapi-outbox.ts` centralise la construction, la déduplication et l’écriture durable des statements.
- `lib/telemetry/xapi.ts` expose les verbes xAPI utilisés, dont `answered` pour le quiz.
- Les routes de session, quiz, évaluation à chaud, évaluation à froid et ouverture de graine alimentent toutes la même frontière d’émission.
- Une tentative de télémétrie sans session authentifiée répond sans perturber le parcours pédagogique et ne crée aucune ligne.
- Les identifiants de déduplication restent stables lors d’un rejeu.
- Les credentials LRS propres à l’organisation sont chiffrés avec AES-256-GCM ; la route de lecture ne renvoie jamais l’authentification.
- Le flag `xapi_emission` reste la porte d’activation par organisation.

## Recette production P3-C

La recette authentifiée a créé temporairement une organisation, un cours, une session live, un plan d’ancrage, une graine et les livraisons nécessaires. Elle a d’abord configuré un LRS volontairement inaccessible, puis une terminaison HTTPS externe réelle.

- La première émission de fin de session passe à l’état `failed` avec une tentative enregistrée.
- Après reconnexion, le worker reprend la ligne sans perte.
- Les cinq sources réelles répondent respectivement 200, 202, 201, 201 et 200.
- L’outbox contient exactement cinq lignes envoyées et le LRS externe accepte exactement cinq statements.
- Les cinq types d’objet attendus sont présents, avec l’en-tête xAPI 1.0.3.
- Les cinq acteurs respectent le pseudonyme HMAC Qalem ; aucun nom ni e-mail réel n’est présent.
- Un rejeu du quiz laisse le total à cinq lignes.
- L’enveloppe chiffrée persistée contient un IV de 12 octets et un tag de 16 octets ; aucun credential en clair n’y apparaît.

Le flag a été restauré à sa valeur initiale. L’outbox, la configuration LRS, les évaluations, la session, l’organisation, le compte Auth, la terminaison externe et les fichiers temporaires ont tous été supprimés. Les cinq compteurs de données contrôlés sont à zéro et les deux ressources externes supprimées répondent 404.

## Quality gate et runtime

Le gate complet a été exécuté sur ServeurIA au SHA exact : Prettier, TypeScript et ESLint verts ; 439 fichiers et 2 697 tests Vitest réussis ; build Next.js de 113 pages ; 112 tests Playwright réussis sans retry.

Les déploiements Coolify web `psjf9rkyux66cb2nynxnp54w` et runtime `b4q5lnqeln5jl5nidxyybjuc` ont terminé sur le SHA exact. Les conteneurs web et worker sont sains, comptent zéro redémarrage et `OOMKilled=false` ; la santé publique répond HTTP 200. Les deux services possèdent chacun les deux clés runtime attendues, décodées à 32 octets, sans exposition de leur valeur.
