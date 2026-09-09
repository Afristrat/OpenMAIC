# S-034 — Code vérifié, intégration LMS ouverte

État constaté le 9 septembre 2026, code applicatif `674e6cc`, branche `refork-v030`.

## Vérification globale

- Session 77654, sortie 0 : formatage, TypeScript, lint et 471 fichiers / 2 920 tests unitaires réussis.
- Session 67801, sortie 0 : `CI=1 E2E_PORT=3017 pnpm exec playwright test --retries=0`. La configuration exécute le build de production avant le serveur web, sans réutiliser un serveur existant en CI. Puis 128 tests Chromium réussissent en 5,2 min. Les scénarios LTI simulent leurs API : ce n’est pas une recette LMS réelle.
- Session 31712 après ce cycle : conteneur de validation `OOMKilled=false`, zéro redémarrage, `memory.events` avec `oom=0`, `oom_kill=0`, `max=18292`. Le compteur `max` est cumulatif : aucune garantie d’absence future d’OOM.

## Déploiement réel, non modifié

Lecture SQL de `supabase-db-lkqqmwsn5zydykuv3gd6q7ws`, session 46575 sortie 0 : PostgreSQL 15.8, zéro plateforme LTI ; nouvelles tables `lti_resource_bindings`, `lti_user_bindings`, `lti_launch_sessions`, `lti_grade_outbox`, `lti_quiz_attempts` absentes.

Contrôle de présence uniquement dans le web `bcx5pxyuc9z3lt4jtyjipcqu-194756876048` et les workers `qalem-workers-a14gf0n3u719hnnd2yujrtmr-145306064687` : `LTI_PRIVATE_KEY`, `LTI_PUBLIC_KEY` et `LTI_APP_URL` absents. Le fallback `NEXT_PUBLIC_APP_URL` ne donne pas l’origine `https://qalem.ma` (absence ou autre valeur non affichée). `LTI_KEY_ID` utilise le défaut du code. Sessions 80180 et 47583, sorties 0. Le premier sondage comprenait aussi `LTI_KID`, qui n’est pas le nom utilisé ; il n’est pas retenu comme preuve du kid.

Recherche dans l’index des noms du coffre : aucune clé dédiée LTI/Moodle trouvée. Aucun secret récupéré, créé ou rotaté.

## Conditions restantes

1. LMS choisi et installé après le « Oui feu vert » d’Amine du 9 septembre : Moodle 4.5.13, https://lms-test.qalem.ma. Installation officielle exit 0 (session 7883) et connexion administrateur réelle dans Chromium distant exit 0 (session 52105, `S034_MOODLE_LOGIN_OK`), sans inscription libre. Source officielle figée au SHA `8cbae18a2898cfd8266ec91ac206e12004f0ff5f`, images par digest, base/réseau/volumes dédiés ; web 2 Gio et DB 512 Mio sans swap. Procédure : `infra/moodle/README.md`. Cela ne prouve pas encore le trajet LTI. Nouveaux secrets conservés dans un dossier serveur `0700` ; import DPAPI et purge du presse-papier non certifiés, car presse-papier inaccessible dans cette session.
2. Configurer des clés RSA persistantes identiques côté web/workers, leur identifiant public et l’origine LTI. Pas de clés éphémères de développement ni de rotation non autorisée.
3. Vérifier les advisors et appliquer dans l’ordre les migrations `20260908203735_lti_launch_bindings`, `20260908205450_lti_grade_outbox`, `20260908212516_lti_quiz_attempts`, `20260908231447_lti_quiz_checkpoints`. Les preuves SQL précédentes ont été annulées par rollback.
4. Déployer web/workers avec le schéma compatible ; re-vérifier versions, santé et persistance.
5. Enregistrer la plateforme et les bindings explicites du tenant de test ; vérifier depuis le navigateur le lancement, le destinataire, le score réel, la reprise après panne et l’absence de double note. Ni backend manuel seul ni mock ne remplace cette preuve.

`passes=false` et `closureEvidence=[]` restent inchangés. Le passage à `to_validate` distingue le code présent des prérequis de livraison encore ouverts.
