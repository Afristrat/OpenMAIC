# Checklist bascule — 72 stories de la carrière (`main`) vs `refork-v030` (S0-011)

**Story** : `S0-011` — [CHECKPOINT AMINE] — `.ralph/prd-v2.json`
**Statut** : `passes: false` — reste `false` tant qu'Amine n'a pas rempli la colonne Décision et consigné son verdict. Ce document n'est **pas** une recommandation ; c'est un inventaire de preuves pour arbitrage humain, conforme au prompt P0-B (`OpenMAIC/docs/foundation/0-socle/10-execution-prompts.md`).

## Objectif

Pour chacune des 72 stories livrées sur `main` (« la carrière »), documenter avec preuves fichier:ligne si la capacité correspondante existe, a été portée à l'identique, diverge, ou est absente sur `refork-v030`. **Aucune ligne de ce document ne recommande de garder ou d'abandonner quoi que ce soit** — c'est une contrainte explicite de la story S0-011 (« l'agent ne décide pas »). La colonne Décision reste intégralement vide.

## Méthode et sources

- **Liste des 72 stories** : `main:.ralph/prd.json` (51 stories `S-001`→`S-051`) + `main:.ralph/prd-ui.json` (21 stories `U-001`→`U-021`), lues via `git show main:<chemin>` depuis `C:\projets\Qalem\OpenMAIC` (branche `main`, lecture seule, aucune écriture).
- **Inventaire trilatéral** : `C:\projets\Qalem\refork\inventaire.json` / `inventaire.md` — 264 fichiers `OURS_ONLY` (portage 1:1 depuis `main`, déjà exécuté par S0-002) et 257 fichiers `BOTH_DIFFER` (zone d'arbitrage réelle, adaptation en cours par stories S0-004+).
- **Recherche de preuves** : Grep/Glob/Read exhaustifs sur `main` (repo `OpenMAIC`, lecture seule) et sur `refork-v030-wt` (worktree, branche `refork-v030`). Aucune commande d'exécution (`pnpm`/`npx`/`node`) utilisée — travail de lecture de code uniquement.
- **États possibles** :
  - **PRÉSENT** : capacité retrouvée sur `refork-v030` avec preuve fichier:ligne, comportement équivalent à `main`.
  - **DIVERGENT** : le fichier/la fonction existe sur `refork-v030` mais son comportement diffère matériellement de `main` (signature changée, non câblée dans l'app, renommée, etc.) — les deux versions sont citées.
  - **ABSENT** : aucune trace trouvée sur `refork-v030` malgré recherche ciblée.
- **« Utilisée en prod sur main ? »** : signal factuel (routes/imports/appelants réels trouvés ou non dans le code de `main`), jamais une supposition. `INDÉTERMINABLE` quand la preuve de code ne permet pas de trancher (ex. dépend d'une configuration runtime externe).

## Constats transversaux (factuels, pas des recommandations)

1. **Deux epics entiers structurellement non câblés sur `main` ET sur `refork-v030` (portage fidèle du défaut, pas une régression du refork)** : « Pedagogy Genome » (S-036, S-037) et « Discussion Fingerprint » (S-047, S-048) — leurs fonctions exportées (`collectPedagogyData`, `getOptimizationSuggestion`, `collectDiscussionData`, `suggestNextAgent`/`shouldUseDataDriven`) n'ont **aucun appelant** en dehors de leur propre fichier, ni dans le pipeline de génération, ni dans `director-graph.ts`, ni dans aucune route `app/api/`. Idem pour la télémétrie xAPI (S-035).
2. **Modules « têtes mortes » supplémentaires**, présents et fonctionnels mais jamais appelés en pratique sur `main` (donc portés à l'identique, même défaut, sur `refork-v030`) : MCP Client externe (S-018, et par ricochet S-019/S-020/S-021 dont les intégrations restent des templates désactivés), Skills Registry (S-029, jamais consommé par l'UI de création, impactant S-030/S-031/S-032/U-009), extraction de cartes de révision post-quiz (S-025, le flux « quiz → carte » décrit dans l'US n'existe pas en pratique), LTI Grade Services (S-034, le score n'est jamais renvoyé au LMS).
3. **Six divergences de câblage identifiées spécifiquement sur `refork-v030`** (fichier/composant porté à l'identique, mais son point d'intégration n'est plus importé/rendu, contrairement à `main`) — corrigé le 2026-07-11 après intégration du rapport détaillé chunk-d, qui a révélé que ce symptôme touche plus de lignes que la version initiale de ce document ne le disait : le composant certificat en fin de classroom (U-007, `certificate-prompt.tsx` absent de `stage.tsx` — U-008 en subit aussi les conséquences en aval), le moteur de rendu des plugins de scène (U-010, `PluginRenderer` absent de `components/stage/scene-renderer.tsx` — un plugin comme Code Sandbox ne peut plus s'afficher), le dialogue de publication d'agent marketplace (U-011, `PublishAgentDialog` jamais monté via `agent-config-panel.tsx` — **et ce composant n'est déjà utilisé nulle part sur `main` non plus**), la bannière d'installation PWA (U-020, `pwa-install-banner.tsx` absent de `app/layout.tsx`) et **la bannière de consentement télémétrie RGPD/CNDP** (U-021, `telemetry-consent-banner.tsx` absent de `app/layout.tsx` — point sensible de conformité). *(U-019, initialement classé à tort dans cette liste par une erreur d'identification de composant, corrigé : voir sa ligne dédiée — le vrai indicateur « dans la sidebar » est PRÉSENT et fonctionnel ; un composant distinct `offline-indicator.tsx`, lui réellement orphelin, reste un point mineur non côté par une story dédiée.)*
4. **Renommage incomplet** : `app/layout.tsx` affiche bien « Qalem » sur `refork-v030`, mais `package.json` y porte toujours `"name": "openmaic"` (S-001).
5. **Régression potentielle à vérifier** : le mécanisme d'injection explicite des règles de qualité linguistique FR/AR (`getLanguageName`/`getLanguageQualityRules` dans `lib/generation/prompt-formatters.ts` sur `main`) est introuvable sur `refork-v030` — remplacé par une directive générique inférée par le LLM (S-010).
6. **Deux écarts entre l'énoncé d'acceptance du PRD v1 et le code réel**, vrais sur `main` comme sur `refork-v030` : le seuil du Director data-driven est codé à 50 sessions (`MIN_SAMPLE_SIZE`), pas 1000 comme l'énonce l'acceptance de S-048 ; la table marketplace s'appelle `agent_reviews`, pas `published_agents` comme l'énonce l'acceptance de S-042. Le manifest du skill Coding Workshop (S-032) ne mentionne pas Monaco Editor contrairement à son critère d'acceptance (le vrai sandbox Monaco est une story distincte, S-045).
7. **Répartition indicative** (comptage factuel, pas une recommandation, corrigé le 2026-07-11) : sur les 72 stories, 62 capacités retrouvées **PRÉSENT** (portage à l'identique ou quasi-identique, hors reformatage Prettier), 10 retrouvées **DIVERGENT** (S-001, S-010, S-015, U-007, U-008, U-010, U-011, U-020, U-021, et U-019 nuancé — voir note ci-dessus), 0 **ABSENT**. Note : « PRÉSENT » signifie que le code a été porté — cela ne dit rien de si la capacité est réellement utilisée en production (colonne dédiée), ni de si elle mérite d'être conservée (colonne Décision, réservée à Amine).

---

## Légende des colonnes

| Colonne | Contenu |
|---|---|
| Story ID | Identifiant `S-0XX` (prd.json, 51 stories) ou `U-0XX` (prd-ui.json, 21 stories) |
| Titre | Titre exact de la story dans le PRD v1 |
| Capacité (résumé) | Description en une phrase de ce que la story livre |
| Preuve main (fichier:ligne) | Où la capacité est implémentée sur `main` |
| État sur refork-v030 (preuve fichier:ligne / absent / divergent) | PRÉSENT, DIVERGENT ou ABSENT, avec preuve |
| Utilisée en prod sur main ? | oui / non / partiel / INDÉTERMINABLE, avec justification courte |
| Décision (Amine) | **VIDE — réservée à Amine** |

---

## Domaine : Rebranding

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-001 | Renommer le projet OpenMAIC → Qalem | Rebranding complet (package.json, titre, favicons, meta) | `package.json:2`, `app/layout.tsx:34`, favicons | **DIVERGENT** — `app/layout.tsx` affiche bien `title: 'Qalem'`, mais `package.json:2` du refork reste `"name": "openmaic"` (pas renommé). Favicons présents. | Oui — titre affiché sur chaque page. | |

## Domaine : i18n FR/AR/EN

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-002 | Ajouter les locales fr-FR et ar-MA au système i18n | Extension du type `Locale`, auto-détection, sélecteur FR/AR/EN | `lib/i18n/types.ts:1,3`, `lib/hooks/use-i18n.tsx:13,29-37` | PRÉSENT identique | Oui — hook utilisé partout dans l'app. | |
| S-003 | Traduire le module common en FR et AR | Clés `common.*`, `home.*`, `toolbar.*`, `export.*` | `lib/i18n/common.ts:1072,1556` | PRÉSENT sur refork (`lib/i18n/common.ts:1208,1829`) | Oui. | |
| S-004 | Traduire le module chat en FR et AR | Clés `chat.*`, `actions.*`, `agentBar.*`, `proactiveCard.*`, `voice.*` | `lib/i18n/chat.ts:149,223` | PRÉSENT identique (295 lignes des deux côtés) | Oui. | |
| S-005 | Traduire le module generation en FR et AR | Clés `classroom.*`, `upload.*`, `generation.*` | `lib/i18n/generation.ts:137,206` | PRÉSENT (271-272 lignes) | Oui. | |
| S-006 | Traduire le module settings en FR et AR | 500+ lignes de clés `settings.*` | `lib/i18n/settings.ts:1224,1841` (2456 lignes) | PRÉSENT sur refork (`lib/i18n/settings.ts:1244,1876`, 2493 lignes — légèrement étoffé par l'upstream) | Oui. | |
| S-007 | Traduire le module stage en FR et AR | Clés `stage.*`, `whiteboard.*`, `quiz.*`, `roundtable.*`, `pbl.*`, `share.*` | `lib/i18n/stage.ts:300,450` | PRÉSENT (598-599 lignes) | Oui — cœur de l'expérience classroom. | |
| S-008 | Traduire les agents par défaut en FR et AR | 6 agents par défaut traduits selon la locale active | `lib/i18n/common.ts:1475-1480` | PRÉSENT sur refork (`lib/i18n/common.ts:1679-1694`, mêmes noms) | Oui. | |
| S-009 | Support RTL pour l'arabe | `dir` dynamique, styles RTL sidebar/chat/whiteboard | `components/html-direction-manager.tsx`, `app/globals.css:192-209` | PRÉSENT identique (`app/globals.css:642-659`) | Oui. | |
| S-010 | Adapter les prompts de génération pour FR/AR | Injection de langue + règles de qualité linguistique dans les prompts | `lib/generation/prompt-formatters.ts:16,24` (`getLanguageName`/`getLanguageQualityRules`), `lib/generation/outline-generator.ts:101-103` | **DIVERGENT** — les 11 templates `{{language}}` existent toujours, mais `getLanguageName`/`getLanguageQualityRules` sont introuvables sur tout `refork-v030-wt` (0 résultat). Le refork utilise un `languageDirective` générique inféré par le LLM au lieu de l'injection explicite de règles de qualité FR/AR dédiées. | Oui — mécanisme central du pipeline outline sur `main`. **Régression fonctionnelle potentielle, pas une simple divergence de style.** | |

## Domaine : TTS Voix naturelles

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-011 | Ajouter des voix FR et AR à ElevenLabs | 4+ voix FR, 3+ voix AR (dont Ghizlane Darija) | `lib/audio/constants.ts:734-97` | PRÉSENT identique (mêmes IDs) | Oui. | |
| S-012 | Rendre Azure TTS dynamique (supprimer hardcode zh-CN) | SSML `xml:lang` dynamique, voix FR/AR Azure | `lib/audio/tts-providers.ts:273-274`, `lib/audio/constants.ts:188,194,201,207` | PRÉSENT identique | Oui. | |
| S-013 | Intégrer Fish Audio S2 comme provider TTS | Provider `fish-audio`, streaming, 6+ voix | `lib/audio/constants.ts:847`, `lib/audio/tts-providers.ts:460,177` | PRÉSENT sur refork (`lib/audio/constants.ts:1008-1013`, `lib/audio/tts-providers.ts:840,182`) | Oui. | |
| S-014 | Intégrer Cartesia Sonic 3 comme provider TTS | Provider `cartesia`, streaming WebSocket, 4+ voix | `lib/audio/tts-providers.ts:506,181` | PRÉSENT sur refork (`lib/audio/constants.ts:1067-1072`, `lib/audio/tts-providers.ts:887,185`) | Oui. | |
| S-015 | Rendre le voice-resolver conscient de la locale | Filtrage des voix par langue, fallback EN | `lib/audio/voice-resolver.ts:16-53` | **DIVERGENT** fonctionnellement équivalent — signature réécrite (`overrides`, `enabled` au lieu de `available`, retour nullable), mais commentaire explicite confirmant un portage intentionnel (« Locale-aware fallback (Qalem) »). | Oui — appelé dans le flux de résolution de voix. | |
| S-016 | TTS hybride — clé serveur + clé utilisateur | Résolution client > serveur > vide, aucune clé exposée côté client | `lib/server/provider-config.ts`, `app/api/generate/tts/route.ts:12` | PRÉSENT identique | Oui — chemin obligatoire de toute génération TTS. | |

## Domaine : MCP Octopus

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-017 | Exposer Qalem comme MCP Server | Serveur MCP, tools `generate_classroom`/`get_quiz`/`get_slide_content`, transport SSE | `lib/mcp/server.ts:14,34,47`, `app/api/mcp/route.ts:18-36` | PRÉSENT identique (même version SDK) | INDÉTERMINABLE — code branché et fonctionnel, mais aucune preuve d'appel MCP réel en prod dans le code seul. | |
| S-018 | Implémenter le MCP Client pour serveurs externes | Client MCP, config `mcp-servers.yml`, tools injectables dans PBL/Director | `lib/mcp/client.ts:201,246`, `lib/mcp/config.ts:34` | PRÉSENT identique (diff Prettier seul) | Non — zéro appelant (recherche exhaustive `app/`, `components/`, `director-graph.ts`, agents). Même constat sur refork. | |
| S-019 | Connecter NotebookLM via MCP | Config serveur MCP NotebookLM, `search_notebook`/`get_source_content` | `mcp-servers.yml.example:15-20` (`enabled: false`), `components/admin/mcp-tab.tsx:12-13` | PRÉSENT identique | Non — template désactivé, dépend de S-018 non câblé ; l'onglet admin MCP est un mock explicite (commentaire « Mock data », `handleTestConnection` échoue systématiquement après un délai simulé). | |
| S-020 | Connecter Notion via MCP | Config serveur MCP Notion, `search_notion`/`get_page_content` | `mcp-servers.yml.example:24-30` | PRÉSENT identique | Non — même constat que S-019. | |
| S-021 | Connecter Google Drive via MCP | Config serveur MCP Drive, `search_drive`/`get_document` | `mcp-servers.yml.example:34-40` | PRÉSENT identique | Non — même constat. | |

## Domaine : Backend Supabase

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-022 | Setup Supabase (schema + auth + RLS) | Migrations, auth email + OAuth, RLS sur toutes les tables, RBAC | `supabase/migrations/00001_initial_schema.sql` (82 occurrences RLS/policy), `lib/supabase/client.ts:1,13`, `lib/supabase/server.ts:1,11` | PRÉSENT octet-identique | Oui — importé dans 27 fichiers, flux auth branché de bout en bout (`app/auth/page.tsx`, `components/header.tsx`). | |
| S-023 | Migration IndexedDB → Supabase (sync hybride) | Sync bidirectionnelle, mode invité IndexedDB-only, conflits last-write-wins | `lib/storage/supabase-provider.ts:11,216,292` | PRÉSENT (diff Prettier uniquement) | Oui — `syncAll()` appelé depuis `lib/hooks/use-sync.ts:48`, hook utilisé dans `navigation-sidebar.tsx`. | |
| S-024 | Écran de connexion / inscription | Email + mot de passe, OAuth Google/GitHub, mode invité | `app/auth/page.tsx`, `components/header.tsx:128-133,159-163` | PRÉSENT (diff Prettier uniquement, logique identique) | Oui — lien réel dans le header. | |

## Domaine : Forgetting Curve Killer (spaced repetition)

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-025 | Extraire les items de révision depuis les quiz | Extraction post-quiz vers cartes de révision | `lib/spaced-repetition/extractor.ts:80` (`extractReviewCards`) | PRÉSENT | Non (constat non évident) — seuls appelants trouvés = tests unitaires. Aucun handler de quiz ne l'appelle ; `review_cards` alimentée uniquement par upsert manuel côté page de révision. Le maillon « quiz → carte de révision » décrit dans l'US n'existe pas en pratique. | |
| S-026 | Implémenter l'algorithme FSRS | 19 poids, `getNextReviewDate`, `getDueCards` | `lib/spaced-repetition/fsrs.ts` | PRÉSENT (diff Prettier uniquement, même logique) | Oui pour `getNextReviewDate` (appelé dans `app/review/page.tsx`) — `getDueCards` jamais appelée, la page réimplémente la requête directement en SQL. | |
| S-027 | Interface de révision espacée | Cartes dues, self-rating, badge sur la home | `app/review/page.tsx`, badge home `app/app/page.tsx:90-113` | PRÉSENT (diff Prettier uniquement) | Oui pour la mécanique, mais alimentée par un flux cassé en amont (S-025) — utilisable seulement si des cartes existent déjà. | |
| S-028 | Notifications de révision (email + push + WhatsApp) | Module multi-canal, préférences utilisateur, cron | `lib/notifications/index.ts` | PRÉSENT (mêmes placeholders TODO conservés) | Partiel — push réellement implémenté (service worker) ; email/WhatsApp = TODO non implémentés (juste un log). Aucun cron trouvé, check déclenché uniquement côté client au chargement de page. | |

## Domaine : Skills System

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-029 | Définir l'architecture du Skills Registry | Interface `Skill`, registry CRUD, chargement depuis `skills/` | `lib/skills/registry.ts`, `app/api/skills/route.ts` | PRÉSENT octet-identique | Non — route API existe mais zéro appelant frontend, aucun sélecteur de skill dans l'UI de création. | |
| S-030 | Créer le skill Medical Training | Agents Dr. Expert/Patient Simulé/Infirmier, prompts médicaux FR/AR/EN | `skills/medical-training/manifest.json` | PRÉSENT | Non — dépend du registry S-029 jamais consommé côté UI. | |
| S-031 | Créer le skill Legal Moot Court | Agents Juge/Avocat/Procureur/Greffier, mode adversarial | `skills/legal-moot-court/manifest.json` | PRÉSENT | Non — même constat registry orphelin. | |
| S-032 | Créer le skill Coding Workshop | Agents Senior Dev/Code Reviewer/Junior, scène sandbox | `skills/coding-workshop/manifest.json` | PRÉSENT | Non — même constat registry orphelin. **Écart d'acceptance factuel** : le critère « Scène interactive Monaco Editor (sandbox) » n'apparaît pas dans ce manifest (aucune mention Monaco) ; le vrai sandbox Monaco est livré par la story distincte S-045. | |

## Domaine : LTI Trojan Horse

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-033 | Implémenter LTI 1.3 Tool Provider | OAuth 2.0, JWKS, launch, table `lti_registrations` | `app/api/lti/launch/route.ts`, `app/api/lti/jwks/route.ts`, `app/api/lti/config/route.ts` | PRÉSENT (diff Prettier uniquement, logique identique) | INDÉTERMINABLE — flux complet et câblé en interne, mais dépend d'une configuration runtime externe (LMS enregistré) hors repo. | |
| S-034 | LTI Assignment and Grade Services (AGS) | Client AGS, envoi de score au LMS, retry backoff | `lib/lti/grade-service.ts:82` (`submitGrade`) | PRÉSENT (diff Prettier uniquement) | Non — zéro appelant réel hors du fichier lui-même (seule autre référence = un commentaire ailleurs). Le score n'est jamais envoyé au LMS après un quiz. Même orphelinage sur refork. | |

## Domaine : Pedagogy Genome / Discussion Fingerprint / Télémétrie xAPI

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-035 | Télémétrie xAPI | Client xAPI ADL conformant, statements quiz/slide/PBL | `lib/telemetry/xapi.ts:1-260`, `lib/telemetry/config.ts:1-20` | PRÉSENT identique | Non — zéro appelant hors fichier. | |
| S-036 | Pipeline de collecte de données pédagogiques | Collecte opt-in anonymisée, table `pedagogy_telemetry` | `lib/telemetry/pedagogy-collector.ts:74`, `supabase/migrations/00003_pedagogy_telemetry.sql` | PRÉSENT identique | Non pour la collecte — seules `hasConsent`/`setConsent` utilisées via `app/api/telemetry-consent/route.ts`. | |
| S-037 | Optimisation pipeline de génération par les données | Ordonnancement optimal basé sur données historiques | `lib/generation/data-optimizer.ts:84` | PRÉSENT identique | Non — aucun appelant, `pipeline-runner.ts` ne l'importe pas. | |
| S-047 | Collecte des patterns de discussion multi-agent | Séquence agents, type d'intervention, corrélation score | `lib/telemetry/discussion-collector.ts:195`, `supabase/migrations/00007_discussion_fingerprint.sql` | PRÉSENT identique | Non — zéro appelant. | |
| S-048 | Director data-driven | Director consommant les patterns agrégés, A/B testing, fallback | `lib/orchestration/data-driven-director.ts` — seuil réel dans le code = `MIN_SAMPLE_SIZE = 50`, pas 1000 comme l'énonce l'acceptance du PRD | PRÉSENT identique (même seuil 50) | Non — `director-graph.ts` n'importe ni `suggestNextAgent` ni `shouldUseDataDriven`. | |

## Domaine : Organisations Multi-Tenant

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-038 | Modèle de données organisations | Tables `organizations`/`org_members`, RLS isolation, RBAC | `supabase/migrations/00001_initial_schema.sql:17,29`, routes `app/api/organizations/*` | PRÉSENT identique | Oui — référencée par plusieurs composants actifs. | |
| S-039 | Interface d'administration d'organisation | Gestion membres, invitation email, paramètres org | `app/org/[orgId]/admin/page.tsx` | PRÉSENT sur refork | Câblée, opérationnelle ; trafic réel indéterminable depuis le code seul. | |
| S-040 | Bibliothèque partagée d'organisation | Table `shared_classrooms`, visibilité, recherche, clone | `supabase/migrations/00004_shared_classrooms.sql`, `app/org/[orgId]/library/page.tsx` | PRÉSENT sur refork | Opérationnelle ; usage réel indéterminable. | |
| S-041 | Templates de classroom par secteur | Table `classroom_templates`, sélection à la création | `supabase/migrations/00005_classroom_templates.sql`, `components/org/template-selector.tsx` | PRÉSENT sur refork | Câblée dans le flux de création (`app/app/page.tsx`). | |

## Domaine : Agent Bazaar (Marketplace)

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-042 | Marketplace d'agents pédagogiques | Publication, filtres, import 1 clic, notation 1-5 étoiles | `supabase/migrations/00006_marketplace.sql:4` (table réelle `agent_reviews`, pas `published_agents` comme le nomme l'acceptance), `app/api/marketplace/agents/route.ts`, `app/marketplace/agents/page.tsx` | PRÉSENT identique | Oui — lien nav actif. | |
| S-043 | Ranking d'agents par performance | Score composite, classement, badge Top Agent | `lib/marketplace/ranking.ts` | PRÉSENT identique | Oui — importée par la route marketplace active. | |

## Domaine : Scene Genome Protocol (plugins)

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-044 | SDK de plugins de scènes | Interface `ScenePlugin`, sandboxing iframe, détection dynamique | `lib/plugins/scene-sdk.ts:16`, `lib/plugins/loader.ts`, `lib/plugins/index.ts`, `components/scene-renderers/plugin-renderer.tsx` | PRÉSENT identique | Oui — câblé dans le rendu réel des scènes. | |
| S-045 | Plugin Code Sandbox | Monaco Editor en iframe, exécution JS/Python (Pyodide) | `plugins/scenes/code-sandbox/*` | PRÉSENT identique | Câblé structurellement (même chemin que S-044) ; usage réel indéterminable depuis le code seul. | |
| S-046 | Plugin Lab Simulation 3D | Three.js + Cannon.js, paramètres, visualisation | `plugins/scenes/lab-simulation/*` | PRÉSENT identique | Même statut que S-045. | |

## Domaine : Institutional Memory (curriculum & reporting)

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-049 | Graphe de curriculum | Table `curriculum_graph`, vue React Flow, suggestion par embedding | `supabase/migrations/00008_curriculum_graph.sql:7`, `app/org/[orgId]/curriculum/page.tsx`, route API | PRÉSENT identique | Route et page câblées ; usage réel indéterminable. | |
| S-050 | Reporting institutionnel pour accréditations | Métriques par apprenant/formation, export PDF/CSV | `app/api/organizations/[orgId]/reports/route.ts`, `app/org/[orgId]/reports/page.tsx` | PRÉSENT identique | Câblées et cohérentes ; volume d'usage indéterminable. | |

## Domaine : Docker Self-Hosted

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| S-051 | Docker Compose avec services séparés | `docker-compose.production.yml`, healthchecks, volumes persistants | `docker-compose.production.yml` (232 lignes) — c'est ce fichier que vise la story, pas `docker-compose.yml` racine (resté l'ancien fichier upstream single-service) | Byte-for-byte identique à `main` sur refork (diff vide) | Artefact de déploiement, pas une capacité applicative ; structurellement correct mais usage réel en prod indéterminable depuis le code seul. | |

---

## UI Exposure — 21 stories (`prd-ui.json`, exposition frontend de capacités backend)

> Ces stories n'ont pas de champ `acceptance` détaillé dans `main:.ralph/prd-ui.json` (seulement `id`/`title`/`phase`) — la « capacité » ci-dessous est déduite du titre et vérifiée directement dans le code de `main`.

### Sous-domaine : Profil / Paramètres

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| U-001 | Fix profil — bouton Enregistrer | `handleSave` fonctionnel sur la page profil | `app/profile/page.tsx:55,220` | PRÉSENT identique sur refork (`app/profile/page.tsx:61,226`) | Oui — action critique du profil utilisateur. | |
| U-002 | Séparer Admin / Clés API / Paramètres en pages distinctes | `app/admin`, `app/settings` en pages distinctes (panneau clés API fournisseurs inclus dans admin) | Dossiers `app/admin/`, `app/settings/` séparés (ex. `app/admin/page.tsx:1055` panneau clé API) | PRÉSENT identique sur refork (mêmes deux dossiers) | Oui. | |
| U-003 | Paramètres notifications | Préférences de notification dans les settings | `components/settings/notification-settings.tsx` | PRÉSENT sur refork (fichier présent) | Oui. | |

### Sous-domaine : Organisations

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| U-004 | Créer une organisation depuis la sidebar | Dialogue de création d'organisation dans la navigation | `components/create-org-dialog.tsx` rendu dans `components/navigation-sidebar.tsx:41,303` | PRÉSENT identique sur refork (`navigation-sidebar.tsx:41,301`) | Oui. | |
| U-005 | Invitation membres avec lien | Génération d'un lien d'invitation par email + rôle | `app/api/organizations/[orgId]/invite/route.ts:74,76` (`inviteUrl`) | PRÉSENT sur refork (fichier présent) | Oui. | |
| U-006 | Dashboard admin organisation amélioré | Interface de gestion enrichie | `app/org/[orgId]/admin/page.tsx` (507 lignes) | PRÉSENT sur refork (527 lignes, légèrement étoffé) | Oui, câblée. | |

### Sous-domaine : Certificats / Skills / Plugins / Marketplace

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| U-007 | Bouton certificat dans classroom | Composant certificat déclenché en fin de classroom | `components/certificate-prompt.tsx` importé et rendu dans `components/stage.tsx:35,952` | **DIVERGENT** — `components/certificate-prompt.tsx` existe sur disque (copié tel quel par S0-002) mais **zéro import dans `components/stage.tsx` ni ailleurs** (recherche exhaustive du repo : seule référence = le fichier lui-même). Composant orphelin, jamais rendu. | Oui sur main (déclenché en fin de classroom). | |
| U-008 | Page Mes certificats | Page listant les certificats obtenus | `app/certificates/page.tsx`, `app/api/certificates/generate/route.ts:14` | **DIVERGENT** — la page liste elle-même est PRÉSENTE et identique (diff Prettier uniquement), mais le point d'entrée classroom est cassé : `components/stage.tsx` sur refork (167 vs 1249 lignes sur main) ne contient plus aucune référence à `Certificate*` (même cause racine que U-007). | Oui sur main (`/certificates` dans navigation-sidebar.tsx, `CertificatePrompt` rendu depuis `stage.tsx:952`) ; sur refork, la page reste accessible directement mais plus jamais atteinte via le flux classroom normal. | |
| U-009 | Page Skills disponibles | Page listant les skills du registry | `app/skills/page.tsx` | PRÉSENT identique sur refork | INDÉTERMINABLE — dépend du Skills Registry (S-029), jamais consommé par l'UI de création selon la recherche sur S-029/030/031/032. | |
| U-010 | Page Plugins de scènes | Catalogue plugins de scènes (Scene Genome Protocol) + moteur de rendu qui les injecte dans le classroom | `app/plugins/page.tsx`, `app/api/plugins/route.ts`, `lib/plugins/scene-sdk.ts:16`, `components/scene-renderers/plugin-renderer.tsx`, câblage `components/stage/scene-renderer.tsx` | **DIVERGENT** — le catalogue (page, route, loader, scene-sdk.ts, dossiers `plugins/scenes/*`) est PRÉSENT (diffs cosmétiques uniquement), mais le **moteur de rendu est cassé** : `components/stage/scene-renderer.tsx` sur refork (41 lignes) ne contient aucun `case 'plugin'` ni import de `PluginRenderer` (switch limité à slide/quiz/interactive/pbl, `default="Unknown scene type"`) ; `lib/types/stage.ts` sur refork ne définit même plus `PluginSceneContent` (upstream v0.3.0 utilise `@openmaic/dsl`). | Oui sur main (`PluginRenderer` câblé dans le dispatcher central de rendu) ; **cassé sur refork** : un plugin de scène (Code Sandbox, Lab Simulation) ne peut plus s'afficher dans une classroom générée sur `refork-v030`. | |
| U-011 | Publier un agent sur la marketplace | Formulaire publication agent (tags, description) → `POST /api/marketplace/agents` | `components/agent/publish-agent-dialog.tsx:31`, `app/api/marketplace/agents/route.ts:5` | **DIVERGENT** — `publish-agent-dialog.tsx` PRÉSENT (diff nul), mais son point d'intégration diverge : sur `main`, rendu depuis `agent-config-panel.tsx:123` ; sur refork, `agent-config-panel.tsx` reste la version pristine upstream v0.3.0, jamais retouchée par le portage, sans aucun import de `PublishAgentDialog`. | **Non, même sur main** : `AgentConfigPanel` (qui contient `PublishAgentDialog`) n'est importé nulle part dans `app/` (recherche exhaustive confirmée) — jamais monté dans une page réelle ; seule l'API POST est fonctionnelle hors UI, sur les deux branches. | |
| U-012 | Détail agent marketplace + avis | Page détail avec notation et avis | `app/marketplace/agents/[agentId]/page.tsx:46,54,113` (`ReviewData`, `StarRatingDisplay`, état `reviews`) | PRÉSENT sur refork (mêmes structures, lignes 40,96,113) | Oui. | |

### Sous-domaine : Billing

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| U-013 | Page pricing publique | Page de tarification accessible publiquement | `app/pricing/page.tsx` | PRÉSENT identique sur refork | Oui. | |
| U-014 | Page de paiement mobile | Page de paiement et confirmation, optimisée mobile | `app/pay/page.tsx`, `app/pay/success/` | PRÉSENT identique sur refork (les deux chemins existent) | Oui. | |

### Sous-domaine : Configuration admin (MCP / LTI / Pedagogy / xAPI)

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| U-015 | Configuration MCP dans admin | Onglet admin listant les serveurs MCP configurés | `components/admin/mcp-tab.tsx` — commentaire explicite en tête de fichier : « Mock data based on mcp-servers.yml.example » | PRÉSENT identique sur refork, même mock conservé | Non fonctionnellement — mock statique, pas une configuration persistée réellement branchée (cohérent avec S-018/S-019/S-020/S-021 jamais câblés). | |
| U-016 | Configuration LTI dans admin | Onglet admin de gestion des plateformes LTI | `components/admin/lti-tab.tsx` | PRÉSENT identique sur refork | INDÉTERMINABLE — dépend de LTI S-033, lui-même indéterminable en prod (nécessite un LMS externe enregistré, hors repo). | |
| U-017 | Dashboard Pedagogy Genome | Onglet admin visualisant les données pédagogiques agrégées | `components/admin/pedagogy-tab.tsx` — commentaire explicite : « Mock data — real data comes from pedagogy_telemetry table » | PRÉSENT identique sur refork, même mock | Non — mock explicite, cohérent avec S-036 jamais alimenté en prod (zéro appelant de `collectPedagogyData`). | |
| U-018 | Widget xAPI status | Widget affichant le statut de connexion xAPI/LRS | `components/admin/xapi-tab.tsx` — `fetch('/api/xapi/status')`, `fetch('/api/xapi/test')` | PRÉSENT identique sur refork | Non — recherche exhaustive dans `app/api/` : **aucune route `/api/xapi/status` ni `/api/xapi/test` n'existe, ni sur main ni sur refork**. Le widget appelle un endpoint inexistant sur les deux branches (défaut hérité, pas une régression du refork). | |

### Sous-domaine : PWA / Sync / RGPD

| Story ID | Titre | Capacité (résumé) | Preuve main (fichier:ligne) | État sur refork-v030 | Utilisée en prod sur main ? | Décision |
|---|---|---|---|---|---|---|
| U-019 | Indicateur sync dans sidebar | Indicateur d'état de synchronisation offline (syncing/pending/synced) intégré à la sidebar, bouton `syncNow()` | `components/navigation-sidebar.tsx:40` (import `useSync`), `:390-429` (bloc "Sync indicator" 3 états), `lib/hooks/use-sync.ts`, `lib/offline/sync-queue.ts` — le titre de la story (« dans la sidebar ») désigne ce bloc, pas le composant séparé `offline-indicator.tsx` (voir note ci-dessous) | PRÉSENT — `navigation-sidebar.tsx` identique sur refork (diff cosmétique), bloc sync + `use-sync.ts` présents. **Correction (2026-07-11) : la 1ʳᵉ version de cette ligne documentait à tort `components/offline-indicator.tsx` (composant distinct, lui réellement orphelin sur refork — jamais importé dans `app/layout.tsx`, ni sur `main` où il l'est à la ligne 14/59 — mais hors du périmètre exact de U-019 selon son titre) ; conservé ici comme point mineur non côté, à vérifier si le champ recouvre les deux éléments.** | Oui — `NavigationSidebar` montée globalement via `sidebar-layout.tsx` → `app/layout.tsx`, rendue sur toute page authentifiée. | |
| U-020 | Bannière installer PWA | Bannière d'invitation à installer l'app en PWA | `components/pwa-install-banner.tsx` importé dans `app/layout.tsx:15` | **DIVERGENT** — même défaut que U-019 : fichier présent sur disque, zéro référence dans `app/layout.tsx` du refork ni ailleurs. | Oui sur main. | |
| U-021 | Bannière consentement télémétrie RGPD | Bannière de consentement à la collecte de télémétrie | `components/telemetry-consent-banner.tsx` importé et rendu dans `app/layout.tsx:16,61` | **DIVERGENT** — même défaut : fichier présent sur disque, jamais importé dans `app/layout.tsx` du refork ni ailleurs. **Point sensible de conformité RGPD/CNDP** : la bannière de consentement à la télémétrie ne s'affiche plus sur `refork-v030` en l'état. | Oui sur main. | |

---

## Comptage de vérification

72 lignes au total : 51 stories `S-001`→`S-051` (domaines Rebranding à Docker Self-Hosted) + 21 stories `U-001`→`U-021` (UI Exposure). Aucune omission, aucun doublon — vérifié par comptage direct des lignes ci-dessus contre la liste exhaustive extraite de `main:.ralph/prd.json` et `main:.ralph/prd-ui.json`.

## Prochaine étape

Ce document reste un inventaire de preuves. **La colonne Décision est intentionnellement vide sur les 72 lignes** : c'est à Amine de la remplir (garder / abandonner / reporter, avec justification), story par story ou par domaine entier là où les constats transversaux le suggèrent (notamment les deux epics « Pedagogy Genome »/« Discussion Fingerprint » et les quatre divergences de câblage U-007/U-019/U-020/U-021). La story `S0-011` ne passe à `passes: true` qu'une fois ce verdict consigné par Amine — jamais par un agent.
