# S1-007 — Recette SCORM 1.2 dans Moodle

Date : 28 août 2026

Branche : `refork-v030`

SHA du paquet recetté : `e7e79ffd748548db5278c28f38146b394931cc89`

SHA de l'alignement documentaire et du gate final : `a2c034303f08e4cc494b1a33711561d817e8228d`

## Contrat recetté

Le package Qalem n'embarque plus `scorm-again`. Le SCO utilise l'adaptateur natif de `lib/export/scorm/tracking-adapters.ts`, recherche l'objet `API` fourni par le LMS hôte et appelle `LMSInitialize`, `LMSSetValue`, `LMSCommit` et `LMSFinish`.

Ce remplacement est intentionnel : `scorm-again` implémente le côté LMS du protocole. L'instancier dans le SCO créait une API locale et ne prouvait pas que le LMS recevait le suivi. ADR-106 supplante donc ADR-102. Le zip ne distribue aucun code `scorm-again` et ne doit contenir aucune notice associée à cette dépendance supprimée.

## Environnement isolé

- hôte d'exécution : `serveuria-MS-7D98` ;
- Moodle : 5.0.1, image locale `bitnamilegacy/moodle:latest` (`a7bd6bf34b73`) ;
- MariaDB : image locale `bitnamilegacy/mariadb:latest` (`bbd4e17f1ef8`), base `utf8mb4` ;
- navigateur : Chromium headless de `qalem-validation:playwright-1.58.2-ffmpeg` ;
- réseau, conteneurs, comptes et données : temporaires, isolés sous le préfixe `qalem-s1007-*`.

Les limites de ressources étaient de 3 Gio pour Moodle et 2 Gio pour MariaDB. Le premier démarrage a échoué parce que la base temporaire n'était pas en Unicode ; `OOMKilled=false`. La base jetable a été recréée en `utf8mb4`, puis l'installation Moodle s'est terminée avec succès.

## Package importé

- cours : `Qalem SCORM Browser Proof` ;
- scènes générées : 2 ;
- archive : 5 917 octets ;
- SHA-256 : `af49a70ec5f630e625b8a3088992d5b19bf3f19720cd87d57e3e2299615421f5` ;
- contenu : `imsmanifest.xml` et `index.html`, tous deux valides dans l'archive ;
- import Moodle : activité `Qalem SCORM Runtime Proof`, `cmId=2`, `scormId=1` ;
- parseur Moodle : 2 SCO trouvés.

## Job d'export réel

Un second paquet a été produit par la chaîne déployée `export_jobs → BullMQ → qalem-workers → Storage`, et non par un appel direct au constructeur :

- job `5908c455-8694-422a-b668-e9aa65d178e6`, job BullMQ `14` ;
- statut final `done`, 2 scènes ;
- archive : 5 894 octets, SHA-256 `b42e46db3f1d1063ea47f18a9be0b36431042f8d35358749b4d8cc5fe66173ab` ;
- fichiers : `imsmanifest.xml` et `index.html` ;
- manifeste SCORM 1.2 et lancement `index.html` confirmés ;
- runtime natif présent, `scorm-again`, `scorm12.min.js` et sa notice absents.

Avant l'exécution, les empreintes SHA-256 de `build-scorm-package.ts`, `tracking-adapters.ts` et `workers.ts` ont été comparées entre le worktree validé et le conteneur worker : les trois paires sont identiques. Après téléchargement et contrôle de l'archive, le stage, ses scènes, le job, le fichier Storage et le job BullMQ terminés ont été supprimés ; les quatre audits finaux retournent zéro résidu.

## Preuve navigateur

Le navigateur s'est authentifié dans Moodle, a ouvert l'activité via `mod/scorm/player.php`, puis a chargé le SCO Qalem dans l'iframe `scorm_object`. Dans cette iframe :

- `window.qalemTracking` est un objet exposant `location`, `complete` et `terminate` ;
- le document contient exactement 2 scènes ;
- le bouton « Marquer comme terminé » affiche « Ce cours a été marqué comme terminé. » ;
- quatre requêtes POST atteignent `mod/scorm/datamodel.php` : initialisation, position, complétion et terminaison ;
- la requête de complétion contient simultanément `lesson_status` et `completed` ;
- aucune erreur de suivi Qalem et aucune erreur de page ne sont émises.

Moodle émet séparément un 404 pour son image de thème historique `theme/yui_image.php?file=3.18.1/arrows.png`. Cette requête appartient au chrome Moodle, pas au package Qalem, et n'affecte ni le SCO ni le suivi.

## Relecture indépendante dans Moodle

Après la sortie de l'activité, deux lectures concordent :

- API Moodle `scorm_get_tracks(2, 2, 1)` : `status=completed`, `score_raw=100` ;
- tables normalisées Moodle : `cmi.core.lesson_status=completed` et `cmi.core.score.raw=100` pour l'utilisateur 2, la tentative 1 et le SCO 2.

La complétion provient donc bien du JavaScript Qalem exécuté dans le navigateur du LMS ; elle n'est ni injectée ni simulée côté PHP.

## Gate final

Dans le worktree ServeurIA isolé `/tmp/qalem-s6013-155f9b3`, au SHA `a2c034303f08e4cc494b1a33711561d817e8228d` : formatage, TypeScript et lint passent ; Vitest passe 378 fichiers et 2 484 tests ; le build produit 99 pages ; Playwright passe 82 tests sur 82 en 3,7 minutes. Journal intégral : `/tmp/qalem-s1007-artifacts/s1-007-full-gate-a2c0343.log`.
