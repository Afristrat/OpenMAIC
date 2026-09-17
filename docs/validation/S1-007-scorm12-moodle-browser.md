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

## Recertification de l’export de production — 16 septembre 2026

La recette autonome du runtime public au SHA
`2716df969b5549bd9e9cf0cde0de5a46884cfd2d` crée un compte, une organisation,
une formation et deux scènes isolés. Elle soumet l’export `scorm12` via la
route authentifiée, attend le worker puis télécharge l’archive privée sans
interception réseau.

Résultat : job `ef0cf0a8-1bb8-433d-bb0a-de486981a3e7` terminé, deux scènes,
archive ZIP valide de 287 969 octets et suppression Storage confirmée. Les
objets temporaires sont supprimés dans le flux de recette. Cette preuve
confirme Qalem jusqu’à l’archive actuelle ; elle ne remplace pas le nouvel
import Moodle et la complétion navigateur LMS requis pour clôturer S1-007.

## État de la réimportation — 17 septembre 2026

Le paquet actuel est importé par les API natives de Moodle 4.5.13 et son
parseur retrouve deux SCO. Le cours, le compte apprenant et le module restent
jetables et sont purgés à chaque essai. La consultation authentifiée de
`mod/scorm/view.php` échoue toutefois avant le lancement du SCO : Moodle répond
HTTP 404 avec « Unable to acquire a lock for caching ». Le répertoire de verrou
global a été créé sur le volume et l’instance Moodle de test a été redémarrée
sans OOM ni redémarrage anormal, mais le verrou de cache applicatif persiste.

Cette situation est une dette de l’infrastructure Moodle de recette, pas une
preuve de compatibilité SCORM. S1-007 reste donc `to_validate` : aucune
complétion ni score Moodle ne sont affirmés au SHA courant avant correction
durable du cache ou exécution dans un Moodle isolé sain.
