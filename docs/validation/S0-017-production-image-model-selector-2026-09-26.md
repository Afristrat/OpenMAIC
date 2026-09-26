# S0-017 — Sélecteur de modèle image en production

Date : 26 septembre 2026

Production fonctionnelle : `f896272b165ef531231dc6c7fd2b6f93dc107f27`

URL : `https://qalem.ma/app`

Preuve : `docs/evidence/s0-017-production-selector-2026-09-26.png`

SHA-256 : `dcc97632a96779cb77c1c867878c8f6a054d27afa40b6119a76d1a6ad71e4c5f`

## Parcours rejoué

Une session temporaire du super-administrateur existant a été obtenue par l’API d’administration Supabase, sans création d’utilisateur ni émission d’e-mail. Chromium a ouvert la production, puis le menu **Médias**, activé la génération d’images et ouvert le sélecteur correspondant.

Le menu affiche en production :

- le fournisseur `OPENAI IMAGE` ;
- l’option sélectionnée et cochée `Gemini 3.1 Flash Image (rapide)` ;
- les autres groupes administrés disponibles sans masquer le modèle actif.

La santé publique répond HTTP 200 avec `imageGeneration: true`. Le conteneur web est sain, sans redémarrage. Aucun compte ni donnée de tenant n’a été créé ou modifié par cette recette.

## Verdict

La preuve machine et la capture de production sont acquises. Conformément au checkpoint de la story, `S0-017` reste `to_validate/passes=false` jusqu’au verdict visuel explicite d’Amine sur la lisibilité et l’absence d’ambiguïté du libellé.
