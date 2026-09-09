# Moodle de recette LTI Qalem

Instance autorisée par Amine le 9 septembre 2026. Ce LMS est réservé aux données
synthétiques de recette ; ce n’est ni une offre Moodle de production ni une
ouverture des inscriptions Qalem.

- URL : https://lms-test.qalem.ma
- Hôte : ServeurIA, `/home/serveuria/qalem-lti-moodle`.
- Moodle 4.5.13 : commit `8cbae18a2898cfd8266ec91ac206e12004f0ff5f` du dépôt officiel.
- Images PHP 8.3 et PostgreSQL 16 figées par digest dans `compose.yml`.
- Projet Compose `qalem-lti-moodle`, indépendant de Coolify et des autres bases.
- Plafonds : web 2 Gio / 1,5 CPU / 4 processus PHP ; DB 512 Mio / 0,5 CPU.
  `memswap_limit=mem_limit` interdit le swap pour les deux conteneurs. Le plafond
  borne les ressources, mais ne garantit pas l’absence d’OOM sous surcharge.
- Le port web est lié à `127.0.0.1:8096` seulement ; la DB ne publie aucun port.
  Son réseau est interne. Seul le web dispose aussi d’un réseau sortant.
- Base et fichiers dans les volumes nommés `qalem-lti-moodle_database` et
  `qalem-lti-moodle_data`. Le code source est monté en lecture seule.
- Inscription libre et bouton invité désactivés, authentification obligatoire,
  envoi d’e-mails désactivé, indexation interdite. Aucun fournisseur IA activé.
- Pas de cron Moodle configuré : cette instance sert aux lancements et retours
  de notes LTI synchrones, pas à la recette de tâches planifiées Moodle.

## Installation reproductible

Toutes les commandes s’exécutent sur ServeurIA. Ne pas réutiliser ni effacer
l’ancien conteneur arrêté `scorm-test-moodle`.

1. Cloner le tag officiel `v4.5.13` dans le chemin `source` ci-dessus et vérifier
   son SHA. Copier les fichiers de ce dossier dans le sous-dossier `infra`.
2. Créer le sous-dossier `secrets` en mode `0700`. Exécuter `secrets.php` dans
   l’image PHP, avec ce dossier monté sur `/secrets` et le script sur `/proof`.
   Le script génère deux secrets cryptographiques et refuse de les remplacer.
   Ne jamais le relancer pour réparer un simple redémarrage.
3. Copier `config.php` vers `source/config.php`. Aucun secret n’est dans ce
   fichier : le mot de passe DB est lu depuis un secret Docker.
4. Exécuter `docker compose -f infra/compose.yml up -d` depuis ce répertoire.
   `init.sh` active le module Apache requis et prépare les permissions du volume.
5. Une seule fois, exécuter `install.php` via `docker compose run --rm --no-deps
   -T --entrypoint php --user www-data`, avec le fichier `secrets/admin_password`
   monté en lecture seule sur `/run/secrets/admin_password`. L’installateur
   officiel refuse une base déjà initialisée. Le secret ne passe pas dans argv.
6. Publier la seule route `lms-test.qalem.ma` avec `register-tunnel.ps1` via le
   broker `CLOUDFLARE_API_TOKEN`. Il refuse tout remplacement de DNS incompatible,
   vérifie la version de configuration puis préserve les autres règles d’ingress.
   Le connecteur hôte existant est `cloudflared-nahda.service` ; ne pas le recréer.
7. Exécuter `scripts/proofs/s034-moodle-login.mjs` dans le runner Qalem distant,
   avec `QALEM_MOODLE_ADMIN_PASSWORD` injecté en mémoire, sans afficher sa valeur.

## Secrets et sauvegarde

Deux fichiers serveur persistants, non versionnés : `secrets/db_password` et
`secrets/admin_password`, dans le dossier `0700`. Le second n’est pas monté
dans le serveur web permanent. L’identifiant administrateur est `qalem-lti-admin`.

L’import de `QALEM_MOODLE_ADMIN_PASSWORD` dans le coffre DPAPI a échoué le
9 septembre : le presse-papier de la session est inaccessible. La purge du
presse-papier et de son historique n’a pas pu être certifiée non plus. Aucun
secret n’a été affiché et aucun contournement du mécanisme d’écriture du coffre
n’a été utilisé. Reprendre l’import officiel quand le presse-papier est disponible.

Les volumes assurent la persistance, pas une sauvegarde indépendante. Ne pas
utiliser cette instance pour des données irremplaçables.

## Arrêt / reprise

`docker compose -f infra/compose.yml stop` arrête uniquement cette stack en
conservant ses volumes. `up -d` la reprend. Ne jamais utiliser `down -v` pour un
simple retour arrière. Supprimer une publication ultérieurement nécessite de
cibler exclusivement le DNS et l’ingress `lms-test.qalem.ma`.

## Sources

- https://download.moodle.org/releases/security/
- https://github.com/moodle/moodle/tree/v4.5.13
- https://github.com/moodlehq/moodle-php-apache
- https://docs.moodle.org/405/en/External_tool_settings

La preuve LMS complète reste dans `docs/validation/S-034-lti-delivery.md` :
installer Moodle n’applique pas les migrations Qalem et ne prouve pas AGS.
