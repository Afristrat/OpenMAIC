# S6-012 — Acceptation humaine du catalogue vocal FR/EN

Date de clôture : 2026-09-06
SHA fonctionnel revalidé : `01ac44b549f14cf3221b6649abd87ede9747dc1d`

## Verdict

Le catalogue vocal de dix identités utilisables en français et en anglais est accepté. Amine a confirmé l’écoute par « oui c’est bon » dans la session Qalem, après avoir indiqué qu’il était en train d’écouter les aperçus. Cette confirmation lève l’unique verrou humain conservé dans S6-012.

## Preuves conservées

Le manifeste `docs/evidence/s6-012-voice-preview-manifest.json` conserve pour chacun des vingt aperçus réels la taille et l’empreinte SHA-256. La preuve de production du 2026-08-27 couvre également la conservation du choix vocal pendant la génération, le rechargement et la régénération, ainsi que la cohérence entre le prénom, l’avatar, le genre et la voix.

## Revalidation fraîche

Le 2026-09-06, le point `/health` du serveur Higgs réellement configuré dans le worker Qalem répond HTTP 200 et annonce 16 profils. Les dix identités qualifiées sont toutes présentes : 10 disponibles sur 10, aucune manquante.

Le gate complet du SHA courant passe Prettier, TypeScript, ESLint, 439/439 fichiers et 2 697/2 697 tests Vitest — dont les quatre contrats du catalogue vocal —, le build de 113 pages et 112/112 tests Playwright sans retry. Le worker déployé sert ce SHA, est `healthy`, compte zéro redémarrage et `OOMKilled=false`.

## Recertification de la préécoute du 26 septembre 2026

Après correction de la régression des deux lecteurs de l’accueil, Amine confirme
explicitement « Audible les deux » depuis le sélecteur de la formatrice et celui
d’un agent. Les WAV FR/Hanae et EN/Mehdi avaient déjà été régénérés par les mêmes
frontières de production avec décompte réel. Le verdict humain clôt donc la
réouverture de S6-012 sans extrapoler l’audibilité depuis la seule réponse HTTP.
