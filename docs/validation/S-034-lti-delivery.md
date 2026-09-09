# S-034 — Code vérifié, intégration LMS ouverte

État constaté le 9 septembre 2026, code applicatif `674e6cc`, infrastructure `8b995bd`, branche `refork-v030`. S-034 reste ouverte.

## Vérification globale

- Session 77654, sortie 0 : formatage, TypeScript, lint et 471 fichiers / 2 920 tests unitaires réussis.
- Session 67801, sortie 0 : `CI=1 E2E_PORT=3017 pnpm exec playwright test --retries=0`. La configuration exécute le build de production avant le serveur web, sans réutiliser un serveur existant en CI. Puis 128 tests Chromium réussissent en 5,2 min. Les scénarios LTI simulent leurs API : ce n’est pas une recette LMS réelle.
- Session 31712 après ce cycle : conteneur de validation `OOMKilled=false`, zéro redémarrage, `memory.events` avec `oom=0`, `oom_kill=0`, `max=18292`. Le compteur `max` est cumulatif : aucune garantie d’absence future d’OOM.

## État initial avant préparation du déploiement

Lecture SQL de `supabase-db-lkqqmwsn5zydykuv3gd6q7ws`, session 46575 sortie 0 : PostgreSQL 15.8, zéro plateforme LTI ; nouvelles tables `lti_resource_bindings`, `lti_user_bindings`, `lti_launch_sessions`, `lti_grade_outbox`, `lti_quiz_attempts` absentes.

Contrôle de présence uniquement dans le web `bcx5pxyuc9z3lt4jtyjipcqu-194756876048` et les workers `qalem-workers-a14gf0n3u719hnnd2yujrtmr-145306064687` : `LTI_PRIVATE_KEY`, `LTI_PUBLIC_KEY` et `LTI_APP_URL` absents. Le fallback `NEXT_PUBLIC_APP_URL` ne donne pas l’origine `https://qalem.ma` (absence ou autre valeur non affichée). `LTI_KEY_ID` utilise le défaut du code. Sessions 80180 et 47583, sorties 0. Le premier sondage comprenait aussi `LTI_KID`, qui n’est pas le nom utilisé ; il n’est pas retenu comme preuve du kid.

À ce stade initial, aucune clé dédiée LTI/Moodle n’était présente dans l’index du coffre. De nouvelles clés ont ensuite été créées selon l’état courant ci-dessous ; aucune rotation n’a été effectuée.

## État courant après autorisation Moodle

- Observation Moodle terminée : session 41637, sortie 0, 31 relevés sains de 09:47:23 à 10:02:37 UTC ; aucun OOM ni redémarrage, `S034_MOODLE_HEALTH_15MIN_OK`. Ce n’est pas un test de capacité sous charge.
- Quatre migrations fonctionnelles appliquées dans une transaction, puis `20260909095958_lti_binding_indexes.sql` appliquée : sept index ajoutés. Sauvegarde préalable **du schéma seulement** : `/home/serveuria/qalem-lti-backups/pre-s034-schema.sql.gz`, dossier 0700, fichier 0600, gzip vérifié.
- Advisors post-index : 222 signalements globaux, zéro ERROR ; aucun `unindexed_foreign_keys` LTI. Les index neufs inutilisés et les cinq tables LTI RLS sans politique cliente sont signalés INFO ; ces dernières sont volontairement accessibles uniquement au serveur. Les signalements globaux ne sont pas déclarés corrigés.
- RSA 3072 persistée dans `/home/serveuria/qalem-lti-keys` (0700, fichiers 0600) et dans Coolify pour les deux applications. Signature et égalité web/worker vérifiées via le modèle Coolify, sans afficher les valeurs. Empreinte SHA-256 publique : `55ba7d4fdeea5a6882c90468a89c7c41670776d1d3930f7bcd1c548e1678998a`. Identifiant `qalem-lti-20260909`, origine `https://qalem.ma`. Quatre variables runtime, non buildtime. Import DPAPI non réalisé : presse-papier inaccessible.
- Fixture réelle Moodle créée par ses API PHP natives : cours 2, activité 1 / module 2, apprenants fictifs 3 et 4. Deux exécutions de `infra/moodle/fixture.php` conservent les mêmes identifiants. Côté Qalem : tenant et stage `s034-moodle-20260909`, quiz pondéré 1/3, bindings explicites. Aucun score, lancement, tentative ou outbox fabriqué en SQL.
- Nouveau gate au SHA `8b995bda7b732be8af95fba8953461e449301d5a` : formatage, TypeScript, lint, 471 fichiers / 2 920 tests unitaires et build réussis. Premier navigateur : 126/128, deux délais PWA dépassés. Diagnostic ciblé inchangé avec traces : 6/6. Suite complète du même build, session 43121 sortie 0 : 128/128 en 4,5 minutes, sans retry. **Cause de l’intermittence PWA non établie**, aucun correctif appliqué ; ne pas confondre rerun vert et résolution définitive.
- Déploiements sérialisés **terminés** au SHA exact `8b995bd` : web `ycurbgrlqbjd5jruruovcjdu`, runtime `r9jdz5pqykbiy690gr8dwgdb`. Web `bcx5pxyuc9z3lt4jtyjipcqu-101651371590` et worker `qalem-workers-a14gf0n3u719hnnd2yujrtmr-102255141634` sains ; clés effectives et signature vérifiées dans chacun. Capture `capture-worker-a14gf0n3u719hnnd2yujrtmr-102255155250` saine. Plafonds web 1,5 Gio, worker 3 Gio conservés ; aucun OOM ni redémarrage observé.

## Recette réelle Moodle → Qalem → Moodle

Scripts versionnables : `s034-moodle-quiz.mjs`, `s034-moodle-gradebook.mjs`, `s034-moodle-outage.sh` sous `scripts/proofs/`. Aucun mock réseau, aucun score écrit par le script de fixture, aucune fabrication de session LTI.

1. Session 60527 sortie 0 : apprenant A connecté à Moodle, lancement signé, contexte Qalem actif, quiz réel à **25/100** ; livraison `80458aab-59cb-4d52-8821-72d1bc20cf40`, identique après rechargement du navigateur, zéro HTTP d’erreur.
2. Session 46178 sortie 0 : apprenant B, même parcours à **100/100** ; livraison `b9ddfb07-c474-4fa8-9255-04f76ee8fc66`, identique après rechargement, zéro HTTP d’erreur.
3. Les deux notes, d’abord conservées `pending` pendant le déploiement du worker, sont ensuite `sent`, une tentative chacune. Carnet de notes Moodle lu dans Chromium administrateur : A=25 et B=100, `S034_REAL_MOODLE_GRADEBOOK_OK`.
4. Session 89765 sortie 0 : troisième quiz A à **0/100**, après lancement réel puis suspension du seul conteneur Moodle de test. Livraison `517005bb-be22-4c5c-a860-bf718838577d`. Le worker constate réellement `pending|1|AGS transport failure`. Le script réactive Moodle, y compris en cas d’échec via trap ; aucun autre service suspendu. Après backoff, `sent`, deux tentatives. Nouvelle lecture navigateur du carnet : A=0 et B=100.
5. Contrôle SQL indépendant : trois tentatives et trois request IDs distincts ; trois livraisons `sent`. Audit Supabase : trois succès et l’échec de transport du score 0, statuts `Completed` / `FullyGraded`, maximum 100. Moodle : deux lignes courantes (A=0, B=100), exactement trois changements historiques (A=25, A=0, B=100), un exemplaire de chaque. Les rechargements n’ont créé aucun doublon.

La panne volontaire a transitoirement rendu la santé Moodle `unhealthy` sans OOM ni redémarrage. Le premier moniteur a donc refusé de commencer sa fenêtre saine. Retour à `healthy` confirmé, puis nouveau moniteur en session **63893**, démarré à **10:31:37 UTC**, cinq conteneurs et deux endpoints vérifiés toutes les trente secondes. Attendre son résultat terminal avant de conclure sur les quinze minutes.

## Conditions restantes

1. LMS choisi et installé après le « Oui feu vert » d’Amine du 9 septembre : Moodle 4.5.13, https://lms-test.qalem.ma. Installation officielle exit 0 (session 7883) et connexion administrateur réelle dans Chromium distant exit 0 (session 52105, `S034_MOODLE_LOGIN_OK`), sans inscription libre. Source officielle figée au SHA `8cbae18a2898cfd8266ec91ac206e12004f0ff5f`, images par digest, base/réseau/volumes dédiés ; web 2 Gio et DB 512 Mio sans swap. Procédure : `infra/moodle/README.md`. Cela ne prouve pas encore le trajet LTI. Nouveaux secrets conservés dans un dossier serveur `0700` ; import DPAPI et purge du presse-papier non certifiés, car presse-papier inaccessible dans cette session.
2. Terminer l’observation post-déploiement, puis versionner et vérifier la présence distante des preuves. Déploiement, clés runtime et recette LMS fonctionnelle sont acquis par les contrôles ci-dessus.
3. Ne pas transformer les limites de cette recette en garanties universelles : absence future d’OOM, toutes les marques de LMS et résolution de l’intermittence PWA ne sont pas prouvées.
4. Importer les nouveaux secrets avec l’outil officiel du coffre lorsque le presse-papier est accessible ; ne pas les recréer pour contourner cet obstacle.

`passes=false` et `closureEvidence=[]` restent inchangés. Le passage à `to_validate` distingue le code présent des prérequis de livraison encore ouverts.
