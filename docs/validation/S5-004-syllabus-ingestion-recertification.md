# S5-004 — Recertification du plan auteur et de l’ingestion documentaire

Date : 2026-09-03

Branche : `refork-v030`
SHA fonctionnel certifié et déployé : `b7c389ff581a3c8d974a2c838f962617b063df44`

## Correction issue de la recette

La première preuve de production a échoué avant la génération : un nouveau navigateur sélectionnait le premier modèle de `OPENAI_MODELS`, `kimi-k2.5`, alors que l’opérateur avait configuré `DEFAULT_MODEL=openai:deepseek-v4-flash`. LiteLLM refusait Kimi 2.5 et aucune chaîne de repli ne s’appliquait à ce modèle direct.

`getServerProviders()` présente désormais le modèle par défaut administré en tête de la liste du fournisseur correspondant. Le choix explicite d’un autre modèle reste possible. Le contrôle permanent ajouté reproduit l’ordre réel Kimi/DeepSeek et exige que DeepSeek soit proposé en premier.

## Preuves ServeurIA

- Tests ciblés ingestion, syllabus, requête persistante et conservation du plan : 10 fichiers, 41/41 tests ; log SHA-256 `eb71a2499951f0ba65dbe30d6bb2e6e5c4de73b0b8a3b022b8ea08553bcf9b20`.
- Parcours ciblés `home-to-generation` et `generation-flow` : 19/19 Chromium ; log SHA-256 `784fc8d6429bd58dfd893f45df11cd8c999cc4e6dba67adea6dd3e8105c107c4`.
- Correction de routage : 137/137 tests ciblés sur `provider-config`, la synchronisation du store et `resolve-model`.
- Gate complet : audit de production sans vulnérabilité connue, Prettier, TypeScript et ESLint verts, 420/420 fichiers et 2 641/2 641 tests Vitest, build de 107 routes, 105/105 Playwright. Log SHA-256 `63cbab4213452919006b8116bbb6cfd91dc8f54d4a46188da7e92ab462e85728`.

## Preuve de production

Déploiement Coolify `j11g2j4c52wo4f9p3gbz61iu`, état `finished`. Le conteneur `601910127b2b` exécute l’image exacte du SHA fonctionnel, est `running/healthy`, n’a aucun redémarrage et n’a pas été tué par manque de mémoire. Limites : 1,5 Gio et 2 CPU. La racine, `/api/health` et `/api/server-providers` répondent 200. Huit lectures consécutives présentent `deepseek-v4-flash` en premier.

Le parcours authentifié sur `https://qalem.ma` prouve :

- PDF texte réel : HTTP 200, marqueur retrouvé, 831 caractères extraits, texte SHA-256 `05034209fdcc3857f4bbe38dc8bb6bea69c7ff47b6c78b38d0d040a0879ffd56` ;
- PDF composé uniquement d’une image : HTTP 422, `NO_READABLE_PDF_TEXT`, guidage OCR observé dans l’interface ;
- syllabus proposé avant toute classroom, avec titre, audience, objectif, stratégie d’évaluation, durée totale et durées de chacune des 11 séquences ;
- titre et audience modifiés, séquences réordonnées, aucune génération avant approbation ;
- une seule confirmation HTTP 202, plan approuvé SHA-256 `46b3830c321f69243052043f6b90feffb9fda76273481842488bfa20f5dd5522` ;
- génération terminée avec 11 scènes sur 11 ;
- suppression réussie de la classroom, de l’organisation et de l’utilisateur de preuve.

L’artefact JSON a le SHA-256 `6106797b4ca5a8af7985528fa0c227486f10c8724a2ee8b247423d5eb56d5fa8`. Les captures ont été inspectées à leur résolution originale : le plan est lisible, structuré et sans chevauchement ; l’état OCR reste exploitable sans masquer l’action principale.

Artefacts permanents : `C:/Users/amans/.codex/visualizations/2026/08/15/01a005ad-360e-7710-aeb5-bf5fc84c67b6/s5-004/`, fichiers suffixés `20260903`.

## Incident de confidentialité Coolify

Une lecture de statut trop large a exposé les quatre secrets de webhooks manuels de cette application dans le transcript. Le jeton API Coolify est resté masqué et aucun secret Qalem, Supabase ou LiteLLM n’a été affiché. Les quatre secrets exposés ont été régénérés atomiquement ; chacun a changé et mesure 40 caractères. Aucune nouvelle valeur n’a été affichée.
