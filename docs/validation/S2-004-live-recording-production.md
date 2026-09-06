# S2-004 — Enregistrement consenti du live

Date de certification technique : 2026-09-06
SHA fonctionnel : `01ac44b549f14cf3221b6649abd87ede9747dc1d`

## Verdict

Le flux d’enregistrement est certifié techniquement de bout en bout. Le gate DPO du 3 septembre 2026 autorisait explicitement développement et tests sous consentement ; la recette est restée temporaire, isolée et intégralement supprimée. Elle ne constitue pas une activation du traitement pour les utilisateurs réels : le flag `live_recording` est revenu à `false` et la formalité CNDP applicable reste un prérequis séparé avant toute ouverture publique.

## Consentement et flux réel

Une identité, une organisation, un cours et un casting temporaires ont été créés en production. Le parcours Chromium authentifié a ouvert la vraie classroom Qalem.

- Avant toute action, aucune session n’existait pour le compte.
- La case de consentement était décochée et le bouton de démarrage désactivé.
- Après consentement explicite, la création répond 201 avec `recorded=true`.
- Cinq événements ont été persistés : `recording_started`, `speech`, `user_message`, `stage_action` et `recording_stopped`.
- Les trois catégories d’acteur sont présentes : `agent`, `system` et `user`.
- Les ajouts par les routes réelles répondent 201.
- Une tentative d’UPDATE sur un événement existant répond 403 : le flux reste append-only en base.

## Audio privé et mesure

Qalem a généré une vraie piste française via Higgs TTS, puis l’a persistée avec l’événement `agent/speech`.

- Piste audio : 172 844 octets.
- JSON des cinq événements relus : 1 046 octets.
- Total contrôlé de la session : 173 890 octets, soit 0,165834 Mio.
- Le streaming authentifié restitue exactement 172 844 octets en HTTP 200 avec `Content-Disposition: inline`.
- Le même accès sans authentification répond 401.

Cette mesure est le coût réel de la session contrôlée à une piste ; elle constitue un plancher, pas une prévision d’une formation complète. Le coût d’une session longue dépend principalement du cumul des pistes audio et doit être suivi en exploitation avant de fixer un quota commercial.

## Suppression et état final

La suppression par l’API utilisateur répond 200. La session et ses événements sont ensuite absents, et l’objet audio supprimé répond 400. Le compte Auth répond 404 après nettoyage ; organisation, session et événements temporaires sont à zéro. Le flag `live_recording` est relu à `false` après la recette.

## Quality gate et runtime

Le même SHA fonctionnel a passé sur ServeurIA Prettier, TypeScript, ESLint, 439/439 fichiers et 2 697/2 697 tests Vitest, le build Next.js de 113 pages et 112/112 tests Playwright sans retry. Le web et le worker déployés sur ce SHA sont `healthy`, sans redémarrage ni OOM ; `/api/health` répond HTTP 200.
