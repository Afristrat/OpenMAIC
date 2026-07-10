[PRD]
# PRD: Qalem — Transformation complète OpenMAIC → Qalem

## Overview

Qalem (قلم) est un fork d'OpenMAIC qui transforme une plateforme de classroom IA interactive chinoise/anglaise en un écosystème éducatif complet ciblant le marché francophone, arabophone et anglophone. Le projet couvre 4 phases sur 24 mois : internationalisation et voix naturelles, data moats et skills, intégrations institutionnelles, et effets de plateforme.

Le fork est un soft fork : on garde la compatibilité upstream THU-MAIC, on ajoute FR/AR/EN par-dessus, ZH-CN reste comme fallback mais est retiré de l'UI.

## Goals

- Remplacer l'interface chinoise par FR/AR/EN avec support RTL complet
- Voix TTS naturelles (pas robotiques) en français, arabe (dont Darija) et anglais via ElevenLabs + Fish Audio S2 + Cartesia
- Transformer OpenMAIC en hub MCP bidirectionnel (premier MCP server éducatif de référence)
- Construire 8 moats structurels Level 6 (data, réseau, intégration, plateforme, switching costs)
- Ajouter un backend Supabase (Auth + PostgreSQL + RLS/RBAC + Realtime)
- Intégrer les LMS via LTI 1.3 générique
- Système d'organisations multi-tenant avec templates par secteur
- Déploiement self-hosted Docker Compose (app + Supabase + Redis + MinIO)

## Quality Gates

Ces commandes doivent passer pour chaque user story :
- `npx tsc --noEmit` — Type checking
- `pnpm lint` — ESLint
- `pnpm test` — Tests unitaires (vitest)
- `pnpm test:e2e` — Tests E2E (Playwright)

Pour les stories UI :
- Vérification visuelle dans le navigateur via Playwright/dev-browser

---

## PHASE 1 — Fondations (Mois 1-3)

### Épique 1 : Rebranding OpenMAIC → Qalem

#### US-001: Renommer le projet OpenMAIC → Qalem
**Description :** En tant que développeur, je veux que le projet soit rebrandé Qalem pour qu'il ait sa propre identité distincte du fork upstream.

**Acceptance Criteria :**
- [ ] `package.json` name changé en `qalem`
- [ ] Titre de l'app dans `layout.tsx` changé en "Qalem"
- [ ] Favicon et apple-icon remplacés par le logo Qalem
- [ ] Meta tags (og:title, og:description) mis à jour
- [ ] Le README.md est mis à jour avec le branding Qalem
- [ ] Le build et le dev server fonctionnent sans erreur

---

### Épique 2 : Internationalisation FR/AR/EN

#### US-002: Ajouter les locales fr-FR et ar-MA au système i18n
**Description :** En tant qu'utilisateur, je veux pouvoir utiliser la plateforme en français ou en arabe pour apprendre dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/i18n/types.ts` : type Locale étendu avec `'fr-FR' | 'ar-MA'`
- [ ] `lib/hooks/use-i18n.tsx` : auto-détection FR (startsWith 'fr') et AR (startsWith 'ar')
- [ ] `lib/hooks/use-i18n.tsx` : validLocales inclut les 3 nouvelles locales
- [ ] Le sélecteur de langue dans `components/header.tsx` affiche les 3 langues (plus ZH-CN retiré de l'UI)
- [ ] ZH-CN reste dans le code comme fallback mais n'apparaît pas dans le sélecteur
- [ ] localStorage persiste le choix de locale

#### US-003: Traduire le module common en FR et AR
**Description :** En tant qu'utilisateur francophone/arabophone, je veux voir les éléments communs (boutons, labels, navigation) dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/i18n/common.ts` : toutes les clés `common.*`, `home.*`, `toolbar.*`, `export.*` traduites en fr-FR
- [ ] `lib/i18n/common.ts` : mêmes clés traduites en ar-MA
- [ ] Les traductions françaises utilisent les accents sur les majuscules (É, È, À, etc.)
- [ ] Les traductions arabes utilisent l'arabe standard moderne (pas de Darija dans l'UI)

#### US-004: Traduire le module chat en FR et AR
**Description :** En tant qu'utilisateur, je veux que le chat et les discussions multi-agent soient dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/i18n/chat.ts` : toutes les clés `chat.*`, `actions.*`, `agentBar.*`, `proactiveCard.*`, `voice.*` traduites en fr-FR et ar-MA
- [ ] Les noms d'actions (spotlight, laser, whiteboard) ont des traductions naturelles

#### US-005: Traduire le module generation en FR et AR
**Description :** En tant qu'utilisateur, je veux que le flow de génération de classroom soit dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/i18n/generation.ts` : toutes les clés `classroom.*`, `upload.*`, `generation.*` traduites en fr-FR et ar-MA
- [ ] Les messages de progression de génération sont traduits naturellement (pas de traduction littérale)

#### US-006: Traduire le module settings en FR et AR
**Description :** En tant qu'utilisateur, je veux configurer mes paramètres dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/i18n/settings.ts` : toutes les clés (500+ lignes) traduites en fr-FR et ar-MA
- [ ] Les noms de providers (OpenAI, Anthropic, etc.) restent en anglais
- [ ] Les descriptions de voix TTS sont traduites
- [ ] Les noms de langues (lang_zh, lang_en, etc.) sont traduits

#### US-007: Traduire le module stage en FR et AR
**Description :** En tant qu'utilisateur, je veux que l'interface du classroom interactif soit dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/i18n/stage.ts` : toutes les clés `stage.*`, `whiteboard.*`, `quiz.*`, `roundtable.*`, `pbl.*`, `share.*` traduites en fr-FR et ar-MA

#### US-008: Traduire les agents par défaut en FR et AR
**Description :** En tant qu'utilisateur, je veux que les agents IA aient des noms et personas dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/orchestration/registry/store.ts` : les 6 agents par défaut ont des noms/personas traduits selon la locale active
- [ ] Agent "AI teacher" → FR: "Professeur IA" / AR: "أستاذ الذكاء الاصطناعي"
- [ ] Agent "AI助教" → FR: "Assistant pédagogique" / AR: "المساعد التعليمي"
- [ ] Agent "显眼包" → FR: "Le Rigolo" / AR: "المرح"
- [ ] Agent "好奇宝宝" → FR: "Le Curieux" / AR: "الفضولي"
- [ ] Agent "笔记员" → FR: "Le Secrétaire" / AR: "المدوّن"
- [ ] Agent "思考者" → FR: "Le Penseur" / AR: "المفكّر"

#### US-009: Support RTL (right-to-left) pour l'arabe
**Description :** En tant qu'utilisateur arabophone, je veux que l'interface s'affiche de droite à gauche.

**Acceptance Criteria :**
- [ ] `app/layout.tsx` : attribut `dir` dynamique basé sur la locale (`rtl` pour ar-MA, `ltr` sinon)
- [ ] `app/globals.css` : styles RTL pour les composants qui nécessitent un mirror (sidebar, chat, navigation)
- [ ] Le slide renderer (`components/slide-renderer/`) fonctionne en RTL
- [ ] Le chat panel (`components/chat/`) s'affiche correctement en RTL
- [ ] Le whiteboard fonctionne correctement en RTL
- [ ] Vérification visuelle : aucun élément cassé en mode RTL

#### US-010: Adapter les prompts de génération pour supporter FR/AR comme langue cible
**Description :** En tant qu'utilisateur, je veux que les classrooms générées soient dans ma langue (contenu des slides, quiz, PBL).

**Acceptance Criteria :**
- [ ] `lib/generation/prompts/templates/requirements-to-outlines/system.md` : instruction ajoutée pour générer dans la langue de l'utilisateur
- [ ] `lib/generation/prompts/templates/slide-content/system.md` : idem
- [ ] `lib/generation/prompts/templates/quiz-content/system.md` : idem
- [ ] `lib/generation/prompts/templates/interactive-html/system.md` : idem
- [ ] `lib/generation/prompts/templates/pbl-actions/system.md` : idem
- [ ] Variable `{{language}}` injectée dans tous les prompts via `interpolateVariables()`
- [ ] La langue est extraite de `UserRequirements.language` (déjà existant dans le type)
- [ ] Test : un classroom généré en FR a du contenu en français, pas en anglais/chinois

---

### Épique 3 : TTS Voix naturelles FR/AR/EN

#### US-011: Ajouter des voix FR et AR à ElevenLabs
**Description :** En tant qu'utilisateur, je veux entendre des voix françaises et arabes naturelles via ElevenLabs.

**Acceptance Criteria :**
- [ ] `lib/audio/constants.ts` : voix FR ajoutées au provider ElevenLabs (minimum 4 voix : 2 hommes, 2 femmes)
- [ ] `lib/audio/constants.ts` : voix AR ajoutées (minimum 3 voix dont "Ghizlane" pour Darija)
- [ ] Chaque voix a un `label` traduit et un `language` tag (fr-FR, ar-MA, ar-SA)
- [ ] Le voice picker dans les settings filtre par langue de la locale active
- [ ] Test : générer un speech en FR avec une voix ElevenLabs FR sonne naturel

#### US-012: Rendre Azure TTS dynamique (supprimer le hardcode zh-CN)
**Description :** En tant qu'utilisateur, je veux qu'Azure TTS parle dans la bonne langue automatiquement.

**Acceptance Criteria :**
- [ ] `lib/audio/tts-providers.ts` : le SSML Azure utilise `xml:lang` dynamique basé sur la voix sélectionnée (pas hardcodé `zh-CN`)
- [ ] `lib/audio/constants.ts` : voix Azure FR ajoutées (`fr-FR-DeniseNeural`, `fr-FR-HenriNeural`)
- [ ] `lib/audio/constants.ts` : voix Azure AR ajoutées (`ar-MA-MounaNeural`, `ar-SA-ZariyahNeural`)
- [ ] Chaque voix Azure a un tag `locale` qui détermine le `xml:lang` du SSML

#### US-013: Intégrer Fish Audio S2 comme nouveau provider TTS
**Description :** En tant qu'utilisateur, je veux accéder à Fish Audio S2 pour ses 50+ émotions et sa qualité FR/AR.

**Acceptance Criteria :**
- [ ] `lib/audio/constants.ts` : nouveau provider `fish-audio` avec metadata (name, description, formats, speedRange)
- [ ] `lib/audio/tts-providers.ts` : implémentation `generateFishAudioTTS()` avec API REST Fish Audio
- [ ] Support streaming API Fish Audio
- [ ] Minimum 6 voix par défaut (2 FR, 2 AR, 2 EN)
- [ ] Support des tags d'émotions dans le paramètre de requête
- [ ] `lib/audio/types.ts` : `TTSProviderId` étendu avec `'fish-audio'`
- [ ] Env var : `TTS_FISH_AUDIO_API_KEY`, `TTS_FISH_AUDIO_BASE_URL`

#### US-014: Intégrer Cartesia Sonic 3 comme nouveau provider TTS
**Description :** En tant qu'utilisateur, je veux Cartesia Sonic 3 pour ses 40ms de latence en discussion temps réel.

**Acceptance Criteria :**
- [ ] `lib/audio/constants.ts` : nouveau provider `cartesia` avec metadata
- [ ] `lib/audio/tts-providers.ts` : implémentation `generateCartesiaTTS()` avec API REST Cartesia
- [ ] Support streaming WebSocket Cartesia
- [ ] Minimum 4 voix (FR + AR + EN)
- [ ] `lib/audio/types.ts` : `TTSProviderId` étendu avec `'cartesia'`
- [ ] Env var : `TTS_CARTESIA_API_KEY`, `TTS_CARTESIA_BASE_URL`

#### US-015: Rendre le voice-resolver conscient de la locale
**Description :** En tant qu'utilisateur, je veux que les agents aient automatiquement des voix dans ma langue.

**Acceptance Criteria :**
- [ ] `lib/audio/voice-resolver.ts` : `resolveAgentVoice()` prend en compte la locale de l'utilisateur
- [ ] Les voix sont filtrées par tag de langue avant l'assignation déterministe
- [ ] Si aucune voix ne correspond à la locale → fallback sur les voix EN
- [ ] Les agents enseignants ont des voix adultes, les étudiants des voix jeunes
- [ ] Test : en locale fr-FR, les agents reçoivent automatiquement des voix FR

#### US-016: TTS hybride — clé serveur par défaut + clé utilisateur optionnelle
**Description :** En tant qu'administrateur, je veux fournir une clé API TTS serveur pour que les utilisateurs n'aient pas besoin de la leur.

**Acceptance Criteria :**
- [ ] `lib/server/provider-config.ts` : la résolution de clé TTS suit l'ordre client > serveur > vide (déjà le cas pour LLM, étendre à TTS)
- [ ] UI settings : si une clé serveur est détectée, afficher "Clé serveur configurée" au lieu du champ de saisie
- [ ] L'utilisateur peut toujours fournir sa propre clé qui override la clé serveur
- [ ] Aucune clé API n'est exposée côté client

---

### Épique 4 : MCP Octopus — Hub éducatif

#### US-017: Exposer OpenMAIC/Qalem comme MCP Server
**Description :** En tant qu'agent IA externe (Claude, Gemini, GPT), je veux appeler Qalem comme outil MCP pour générer des classrooms interactives.

**Acceptance Criteria :**
- [ ] Nouveau fichier `lib/mcp/server.ts` : implémentation MCP Server via `@modelcontextprotocol/sdk`
- [ ] Tool `generate_classroom` : prend un topic + level + language, retourne un classroom ID + URL
- [ ] Tool `get_quiz` : prend un topic + difficulté, retourne un quiz structuré
- [ ] Tool `get_slide_content` : prend un topic, retourne du contenu de slide
- [ ] Transport SSE exposé via `app/api/mcp/route.ts`
- [ ] Authentification par API key
- [ ] Documentation des tools au format MCP standard

#### US-018: Implémenter le MCP Client pour connecter des serveurs externes
**Description :** En tant que développeur, je veux que Qalem puisse consommer des outils MCP externes pour enrichir les classrooms.

**Acceptance Criteria :**
- [ ] Nouveau fichier `lib/mcp/client.ts` : implémentation MCP Client via `@modelcontextprotocol/sdk`
- [ ] Configuration des serveurs externes via `mcp-servers.yml` (ou section dans `server-providers.yml`)
- [ ] Les tools MCP externes sont injectables dans le PBL agentic loop (`lib/pbl/generate-pbl.ts`)
- [ ] Les tools MCP externes sont injectables dans le Director Graph (`lib/orchestration/director-graph.ts`)
- [ ] Gestion des erreurs de connexion/timeout
- [ ] Registry de serveurs avec health check

#### US-019: Connecter NotebookLM via MCP
**Description :** En tant qu'utilisateur, je veux que les agents Qalem puissent accéder à mes notebooks NotebookLM pour enrichir le cours.

**Acceptance Criteria :**
- [ ] Configuration du serveur MCP NotebookLM dans `mcp-servers.yml`
- [ ] Les agents peuvent appeler `search_notebook(query)` pour chercher dans les sources du notebook
- [ ] Les agents peuvent appeler `get_source_content(sourceId)` pour récupérer le contenu d'une source
- [ ] Le pipeline de génération peut utiliser les sources NotebookLM comme matériau d'entrée
- [ ] Documentation utilisateur : comment connecter son NotebookLM

#### US-020: Connecter Notion via MCP
**Description :** En tant qu'utilisateur, je veux importer du contenu depuis Notion pour générer des classrooms.

**Acceptance Criteria :**
- [ ] Configuration du serveur MCP Notion dans `mcp-servers.yml`
- [ ] Tool `search_notion(query)` disponible pour les agents
- [ ] Tool `get_page_content(pageId)` disponible
- [ ] Le pipeline de génération accepte une source Notion comme input
- [ ] Vérification : un cours généré à partir d'une page Notion est cohérent

#### US-021: Connecter Google Drive via MCP
**Description :** En tant qu'utilisateur, je veux utiliser mes documents Google Drive comme source pour les classrooms.

**Acceptance Criteria :**
- [ ] Configuration du serveur MCP Google Drive dans `mcp-servers.yml`
- [ ] Tool `search_drive(query)` disponible
- [ ] Tool `get_document(docId)` disponible
- [ ] Support des formats : Google Docs, Google Slides, PDF dans Drive
- [ ] Le pipeline de génération accepte une source Drive comme input

---

## PHASE 2 — Data Moats (Mois 3-6)

### Épique 5 : Backend Supabase

#### US-022: Setup Supabase (schema + auth + RLS)
**Description :** En tant que développeur, je veux un backend Supabase avec authentification et RLS pour persister les données côté serveur.

**Acceptance Criteria :**
- [ ] Projet Supabase initialisé avec `supabase init`
- [ ] Migration SQL pour les tables : `users`, `organizations`, `org_members`, `stages`, `scenes`, `quiz_results`, `agent_configs`
- [ ] Auth Supabase configuré (email + OAuth Google + OAuth GitHub)
- [ ] RLS activé sur TOUTES les tables sans exception
- [ ] Policies RLS : un utilisateur ne voit que ses données + les données de son organisation
- [ ] RBAC via table `org_members` avec rôle (admin, manager, formateur, apprenant)
- [ ] `.env.local` : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

#### US-023: Migration IndexedDB → Supabase (sync hybride)
**Description :** En tant qu'utilisateur connecté, je veux que mes classrooms soient persistées côté serveur tout en gardant le mode offline.

**Acceptance Criteria :**
- [ ] `lib/storage/supabase-provider.ts` : implémentation de `StorageProvider` pour Supabase
- [ ] Sync bidirectionnelle : IndexedDB ↔ Supabase (local-first, server-sync)
- [ ] Si l'utilisateur n'est pas connecté → mode IndexedDB pur (comportement actuel)
- [ ] Si connecté → write-through : écriture locale + sync serveur en background
- [ ] Conflit de sync : last-write-wins avec timestamp
- [ ] Les audioFiles et imageFiles sont uploadés sur MinIO (pas dans Supabase)

#### US-024: Écran de connexion / inscription
**Description :** En tant qu'utilisateur, je veux pouvoir créer un compte et me connecter pour persister mes données.

**Acceptance Criteria :**
- [ ] `app/auth/page.tsx` : page de connexion/inscription
- [ ] Support email + mot de passe
- [ ] Support OAuth Google
- [ ] Support OAuth GitHub
- [ ] Redirect vers la home après connexion
- [ ] Mode invité : l'app fonctionne sans connexion (IndexedDB only)
- [ ] Le header affiche le profil utilisateur si connecté, un bouton "Connexion" sinon

---

### Épique 6 : Forgetting Curve Killer (Spaced Repetition)

#### US-025: Extraire les items de révision depuis les quiz
**Description :** En tant que système, je veux transformer les quiz en cartes de révision pour alimenter le spaced repetition.

**Acceptance Criteria :**
- [ ] Nouveau module `lib/spaced-repetition/extractor.ts`
- [ ] Après chaque quiz complété, les items ratés ou hésitants sont extraits
- [ ] Format carte : `{ question, correctAnswer, userAnswer, difficulty, tags[], sourceClassroomId, sourceSceneId }`
- [ ] Les cartes sont stockées dans Supabase (table `review_cards`) + IndexedDB (offline)

#### US-026: Implémenter l'algorithme FSRS
**Description :** En tant que système, je veux calculer les intervalles de révision optimaux pour chaque utilisateur.

**Acceptance Criteria :**
- [ ] `lib/spaced-repetition/fsrs.ts` : implémentation de l'algorithme FSRS (open-source)
- [ ] Paramètres FSRS personnalisés par utilisateur (stabilité, difficulté) stockés dans `user_profiles`
- [ ] Fonction `getNextReviewDate(card, rating)` → date de prochaine révision
- [ ] Fonction `getDueCards(userId)` → cartes à réviser maintenant
- [ ] Tests unitaires couvrant les cas limites de l'algorithme

#### US-027: Interface de révision espacée
**Description :** En tant qu'apprenant, je veux une interface de micro-révision pour revoir les concepts que j'ai oubliés.

**Acceptance Criteria :**
- [ ] `app/review/page.tsx` : page de révision
- [ ] Affiche les cartes dues avec le nombre total
- [ ] Chaque carte : question → reveal answer → self-rating (Again, Hard, Good, Easy)
- [ ] Progression visible (X/Y cartes révisées)
- [ ] Les ratings sont envoyés à FSRS pour recalculer les intervalles
- [ ] Lien vers le classroom source pour revoir le cours complet
- [ ] Accessible depuis la home page (badge avec le nombre de cartes dues)

#### US-028: Notifications de révision (email + push + WhatsApp)
**Description :** En tant qu'apprenant, je veux être rappelé quand c'est le moment de réviser.

**Acceptance Criteria :**
- [ ] `lib/notifications/` : module de notifications multi-canal
- [ ] Email via Supabase Edge Functions (template FR/AR/EN)
- [ ] PWA push notifications via service worker
- [ ] WhatsApp via Evolution API (optionnel, configurable par l'utilisateur)
- [ ] Préférences de notification dans les settings utilisateur
- [ ] Fréquence : une notification par batch de cartes dues (pas par carte)
- [ ] Cron job (Supabase pg_cron ou externe) qui check les cartes dues et envoie les notifications

---

### Épique 7 : Système de Skills

#### US-029: Définir l'architecture du Skills Registry
**Description :** En tant que développeur, je veux un système de skills pluggables pour étendre les capacités de Qalem.

**Acceptance Criteria :**
- [ ] `lib/skills/types.ts` : interface `Skill` (id, name, description, category, prompts, sceneTypes, actions, agentProfiles, version)
- [ ] `lib/skills/registry.ts` : registry de skills avec CRUD
- [ ] `lib/skills/loader.ts` : chargement des skills depuis `skills/` directory
- [ ] Les skills sont des dossiers avec un `manifest.json` + fichiers de prompts + configs
- [ ] Les skills built-in sont livrés avec la plateforme (pas de marketplace pour l'instant)

#### US-030: Créer le skill "Medical Training"
**Description :** En tant que formateur médical, je veux un skill spécialisé avec des agents patient/médecin et une terminologie médicale.

**Acceptance Criteria :**
- [ ] `skills/medical-training/manifest.json` : metadata du skill
- [ ] Agents pré-configurés : "Dr. Expert", "Patient Simulé", "Infirmier Observateur"
- [ ] Prompts spécialisés pour la terminologie médicale (FR/AR/EN)
- [ ] Template de classroom "Diagnostic différentiel" et "Protocole d'urgence"
- [ ] Quiz avec grading spécialisé (terminologie médicale)

#### US-031: Créer le skill "Legal Moot Court"
**Description :** En tant que formateur juridique, je veux un skill de simulation de procès avec des agents juge/avocat.

**Acceptance Criteria :**
- [ ] `skills/legal-moot-court/manifest.json` : metadata du skill
- [ ] Agents pré-configurés : "Juge", "Avocat de la défense", "Procureur", "Greffier"
- [ ] Prompts spécialisés pour le droit (configurable par juridiction : Maroc, France, etc.)
- [ ] Mode adversarial : l'avocat adverse contre-argumente automatiquement
- [ ] Template de classroom "Droit du travail" et "Droit commercial"

#### US-032: Créer le skill "Coding Workshop"
**Description :** En tant que formateur tech, je veux un skill de coding avec sandbox et code review IA.

**Acceptance Criteria :**
- [ ] `skills/coding-workshop/manifest.json` : metadata du skill
- [ ] Agents pré-configurés : "Senior Dev", "Code Reviewer", "Junior Curieux"
- [ ] Scène interactive avec Monaco Editor (sandbox code)
- [ ] L'agent Code Reviewer analyse le code de l'apprenant en temps réel
- [ ] Templates par stack : "Intro Python", "API REST Node.js", "React Fundamentals"

---

## PHASE 3 — Intégrations Institutionnelles (Mois 6-12)

### Épique 8 : LTI Trojan Horse

#### US-033: Implémenter LTI 1.3 Tool Provider
**Description :** En tant que LMS (Moodle, Canvas, etc.), je veux lancer une classroom Qalem via LTI.

**Acceptance Criteria :**
- [ ] `app/api/lti/launch/route.ts` : endpoint de lancement LTI 1.3
- [ ] `app/api/lti/jwks/route.ts` : endpoint JWKS pour la validation JWT
- [ ] `app/api/lti/config/route.ts` : configuration JSON pour l'enregistrement dans les LMS
- [ ] OAuth 2.0 flow complet (Platform → Tool)
- [ ] Extraction du contexte LTI : course_id, user_id, role, resource_link
- [ ] Le lancement LTI ouvre directement la classroom correspondante
- [ ] Table Supabase `lti_registrations` pour stocker les configurations par LMS

#### US-034: LTI Assignment and Grade Services (AGS)
**Description :** En tant qu'enseignant LMS, je veux que les scores de quiz Qalem remontent automatiquement au gradebook.

**Acceptance Criteria :**
- [ ] `lib/lti/grade-service.ts` : client LTI AGS
- [ ] Après chaque quiz complété, le score est envoyé au LMS via AGS
- [ ] Support des scores numériques (0-100) et des statuts (completed, in_progress)
- [ ] Gestion des erreurs de connexion (retry avec backoff)
- [ ] Log des grades envoyés dans Supabase pour audit

#### US-035: Télémétrie xAPI
**Description :** En tant qu'institution, je veux collecter des données xAPI sur les interactions des apprenants.

**Acceptance Criteria :**
- [ ] `lib/telemetry/xapi.ts` : client xAPI (ADL conformant)
- [ ] Statements xAPI émis pour : quiz tenté, quiz réussi, slide vue, PBL issue résolu, discussion participée
- [ ] Configuration du Learning Record Store (LRS) via env vars ou settings
- [ ] Les statements incluent le contexte : classroom ID, scene type, durée, score
- [ ] Opt-in : la télémétrie est désactivée par défaut, activable par organisation

---

### Épique 9 : Pedagogy Genome (Data Flywheel)

#### US-036: Pipeline de collecte de données pédagogiques
**Description :** En tant que système, je veux collecter anonymement les données de session pour améliorer la génération.

**Acceptance Criteria :**
- [ ] `lib/telemetry/pedagogy-collector.ts` : collecteur de données
- [ ] Données collectées (opt-in) : séquences de scènes, scores quiz, temps par scène, actions exécutées, taux de complétion
- [ ] Anonymisation : aucune PII, seulement des IDs hashés
- [ ] Stockage dans Supabase table `pedagogy_telemetry`
- [ ] Consentement explicite à la première connexion (RGPD/CNDP compliant)
- [ ] Dashboard admin pour visualiser les données agrégées

#### US-037: Optimisation du pipeline de génération par les données
**Description :** En tant que système, je veux utiliser les données agrégées pour améliorer l'ordonnancement et la difficulté des scènes générées.

**Acceptance Criteria :**
- [ ] `lib/generation/data-optimizer.ts` : module qui consomme les données agrégées
- [ ] Au moment de la génération d'outlines, le module suggère un ordonnancement optimal basé sur les données historiques
- [ ] La difficulté des quiz est calibrée par rapport aux performances passées pour le même sujet/niveau
- [ ] Fallback : si pas assez de données, comportement identique à l'actuel
- [ ] Seuil minimum : 100 sessions sur un sujet avant d'activer l'optimisation

---

### Épique 10 : Organisations Multi-Tenant

#### US-038: Modèle de données organisations
**Description :** En tant qu'administrateur, je veux créer une organisation pour gérer mes formateurs et apprenants.

**Acceptance Criteria :**
- [ ] Tables Supabase : `organizations` (id, name, sector, logo, default_locale, settings), `org_members` (user_id, org_id, role)
- [ ] Rôles : admin, manager, formateur, apprenant
- [ ] RLS : les membres ne voient que les données de leur organisation
- [ ] Un utilisateur peut appartenir à plusieurs organisations
- [ ] API routes : `app/api/organizations/` (CRUD)

#### US-039: Interface d'administration d'organisation
**Description :** En tant qu'admin d'organisation, je veux gérer les membres, les rôles et les paramètres.

**Acceptance Criteria :**
- [ ] `app/org/[orgId]/admin/page.tsx` : dashboard admin
- [ ] Gestion des membres : inviter, supprimer, changer le rôle
- [ ] Invitation par email (lien unique)
- [ ] Paramètres d'organisation : nom, logo, secteur, locale par défaut, skills activés
- [ ] Quotas configurables par rôle (nombre de classrooms, durée TTS, etc.)

#### US-040: Bibliothèque partagée d'organisation
**Description :** En tant que formateur, je veux partager mes classrooms avec les autres membres de mon organisation.

**Acceptance Criteria :**
- [ ] Table Supabase `shared_classrooms` (stage_id, org_id, shared_by, visibility)
- [ ] Visibilité : privé (juste moi), organisation (tous les membres), public (lien partageable)
- [ ] `app/org/[orgId]/library/page.tsx` : bibliothèque de classrooms de l'organisation
- [ ] Recherche et filtrage par sujet, formateur, date, type de scène
- [ ] Un formateur peut "cloner" un classroom partagé dans son espace personnel

#### US-041: Templates de classroom par secteur
**Description :** En tant qu'organisation, je veux des templates de formation pré-configurés pour mon secteur.

**Acceptance Criteria :**
- [ ] Table Supabase `classroom_templates` (id, name, sector, description, requirements, agent_configs, skill_ids)
- [ ] Templates par secteur : santé, juridique, tech, finance, éducation, industrie
- [ ] Chaque template inclut : requirements pré-remplies, agents spécialisés, skills associés
- [ ] UI de sélection de template au moment de la création d'un classroom
- [ ] Un admin d'organisation peut créer des templates custom pour son org

---

## PHASE 4 — Effets de Plateforme (Mois 12-24)

### Épique 11 : Agent Bazaar

#### US-042: Marketplace d'agents pédagogiques
**Description :** En tant qu'utilisateur, je veux découvrir et importer des agents créés par la communauté.

**Acceptance Criteria :**
- [ ] Tables Supabase : `published_agents` (agent_config + author_id + metadata + stats)
- [ ] `app/marketplace/agents/page.tsx` : catalogue d'agents avec recherche et filtres
- [ ] Filtres : matière, niveau, langue, style pédagogique, note moyenne
- [ ] Un formateur peut publier un agent depuis son registry local
- [ ] Import en 1 clic dans son registry personnel
- [ ] Système de notation (1-5 étoiles) et commentaires

#### US-043: Ranking d'agents par performance
**Description :** En tant qu'utilisateur, je veux voir quels agents sont les plus efficaces pour un sujet donné.

**Acceptance Criteria :**
- [ ] Les quiz scores sont agrégés par agent utilisé (corrélation agent ↔ performance)
- [ ] Score composite : moyenne quiz × taux de complétion × nombre d'utilisations
- [ ] Classement visible sur la page de chaque agent
- [ ] Badge "Top Agent" pour le top 10% par catégorie
- [ ] Minimum 50 sessions avant d'afficher un ranking (significativité statistique)

---

### Épique 12 : Scene Genome Protocol

#### US-044: SDK de plugins de scènes
**Description :** En tant que développeur, je veux créer un nouveau type de scène custom pour Qalem.

**Acceptance Criteria :**
- [ ] `lib/plugins/scene-sdk.ts` : interface `ScenePlugin` (renderer, contentGenerator, actions, prompts)
- [ ] Documentation du SDK avec exemples
- [ ] Système de sandboxing : les plugins s'exécutent dans un iframe isolé
- [ ] Le pipeline de génération (`scene-generator.ts`) détecte les plugins installés
- [ ] Les prompts de génération sont étendus dynamiquement pour les nouveaux types de scènes

#### US-045: Plugin "Code Sandbox"
**Description :** En tant qu'apprenant tech, je veux un type de scène avec un éditeur de code exécutable.

**Acceptance Criteria :**
- [ ] Plugin de scène type `code-sandbox`
- [ ] Monaco Editor intégré dans l'iframe
- [ ] Exécution côté client (JavaScript/Python via Pyodide)
- [ ] L'agent peut injecter du code template et des tests
- [ ] Auto-grading basé sur l'exécution des tests

#### US-046: Plugin "Lab Simulation 3D"
**Description :** En tant qu'apprenant scientifique, je veux des simulations 3D interactives (physique, chimie).

**Acceptance Criteria :**
- [ ] Plugin de scène type `lab-simulation`
- [ ] Three.js + Cannon.js pour la physique 3D
- [ ] L'agent peut configurer les paramètres de simulation (gravité, masse, etc.)
- [ ] L'apprenant interagit (déplace des objets, change des paramètres)
- [ ] Visualisation des forces, trajectoires, graphiques en temps réel

---

### Épique 13 : Discussion Fingerprint

#### US-047: Collecte des patterns de discussion multi-agent
**Description :** En tant que système, je veux analyser les discussions multi-agent pour identifier les séquences efficaces.

**Acceptance Criteria :**
- [ ] `lib/telemetry/discussion-collector.ts` : collecteur spécialisé discussions
- [ ] Données : séquence d'agents, type d'intervention (question, réponse, contre-argument, synthèse), durée, quiz score post-discussion
- [ ] Stockage anonymisé dans Supabase
- [ ] Pipeline d'agrégation : corrélation séquence ↔ performance

#### US-048: Director data-driven
**Description :** En tant que Director, je veux orchestrer les discussions en utilisant les patterns empiriquement efficaces.

**Acceptance Criteria :**
- [ ] `lib/orchestration/data-driven-director.ts` : extension du Director avec données empiriques
- [ ] Le Director consomme les patterns agrégés pour choisir l'agent suivant
- [ ] A/B testing intégré : 50% sessions classiques, 50% data-driven (pour mesurer l'amélioration)
- [ ] Fallback sur le Director classique si pas assez de données
- [ ] Seuil minimum : 1 000 sessions de discussion avant activation

---

### Épique 14 : Institutional Memory Layer

#### US-049: Graphe de curriculum
**Description :** En tant qu'admin d'organisation, je veux lier les classrooms en séquences (prérequis → cours → approfondissement).

**Acceptance Criteria :**
- [ ] Table Supabase `curriculum_graph` (from_stage_id, to_stage_id, relation_type, org_id)
- [ ] Types de relation : prerequisite, follows, deepens, reviews
- [ ] `app/org/[orgId]/curriculum/page.tsx` : vue graphe interactive (React Flow)
- [ ] Suggestion automatique de liens basée sur les sujets (embedding similarity)
- [ ] L'apprenant voit un "parcours recommandé" basé sur le graphe

#### US-050: Reporting institutionnel pour accréditations
**Description :** En tant qu'admin, je veux des rapports de performance pour les accréditations et audits.

**Acceptance Criteria :**
- [ ] `app/org/[orgId]/reports/page.tsx` : dashboard de reporting
- [ ] Métriques par apprenant : taux de complétion, scores moyens, temps passé, progression spaced repetition
- [ ] Métriques par formation : nombre d'apprenants, score moyen, taux d'abandon
- [ ] Export PDF et CSV
- [ ] Filtrage par période, formation, groupe d'apprenants

---

### Épique 15 : Docker Compose Self-Hosted

#### US-051: Docker Compose avec services séparés
**Description :** En tant qu'administrateur, je veux déployer Qalem en self-hosted avec Docker Compose.

**Acceptance Criteria :**
- [ ] `docker-compose.yml` : services séparés (qalem-app, supabase-db, supabase-auth, supabase-realtime, redis, minio)
- [ ] `Dockerfile` multi-stage optimisé pour Next.js
- [ ] `.env.docker.example` avec toutes les variables documentées
- [ ] Volume persistant pour MinIO (media), PostgreSQL (données), Redis (cache)
- [ ] Health checks sur tous les services
- [ ] Documentation de déploiement : `docs/self-hosted.md`
- [ ] Script `scripts/setup.sh` pour l'initialisation (migrations DB, buckets MinIO, etc.)

---

## Functional Requirements

- FR-1: L'application doit supporter 3 langues (FR, AR, EN) avec switch instantané sans rechargement
- FR-2: L'arabe doit être affiché en RTL avec mirroring complet de l'interface
- FR-3: Les voix TTS doivent être automatiquement assignées dans la langue de l'utilisateur
- FR-4: Le MCP server doit être accessible via transport SSE sur `/api/mcp`
- FR-5: Le MCP client doit pouvoir se connecter à N serveurs configurés dans `mcp-servers.yml`
- FR-6: L'authentification Supabase doit supporter email + OAuth Google + OAuth GitHub
- FR-7: Le RLS Supabase doit garantir l'isolation des données par utilisateur et par organisation
- FR-8: Le RBAC doit supporter 4 rôles (admin, manager, formateur, apprenant) extensibles à des rôles custom
- FR-9: Le spaced repetition FSRS doit calculer les intervalles individuellement par utilisateur
- FR-10: Les notifications WhatsApp via Evolution API doivent être opt-in et configurables
- FR-11: L'intégration LTI 1.3 doit être compatible avec tout LMS conforme au standard
- FR-12: Les grades LTI doivent être envoyés automatiquement après chaque quiz
- FR-13: La télémétrie xAPI doit être opt-in et RGPD/CNDP compliant
- FR-14: Le mode offline (sans connexion) doit rester fonctionnel (IndexedDB)
- FR-15: Les skills sont livrés avec la plateforme, pas créés par les utilisateurs (Phase 1-2)
- FR-16: Le déploiement Docker Compose doit fonctionner sans dépendance cloud externe

## Non-Goals (Out of Scope)

- Marketplace ouverte aux utilisateurs créateurs (Phase 4 uniquement pour les agents, pas les skills)
- Application mobile native (React Native)
- Vidéoconférence temps réel entre humains
- Intégration Stripe / paiement
- Modération de contenu automatique
- Support de l'hébreu ou d'autres langues RTL (seul l'arabe est ciblé)
- Transcription automatique de cours en direct (ASR est pour le chat vocal uniquement)
- Kubernetes / Helm charts (Docker Compose uniquement)

## Technical Considerations

- **Soft fork upstream** : garder la compatibilité avec THU-MAIC/OpenMAIC pour bénéficier des mises à jour
- **Supabase self-hosted** : utiliser les images Docker officielles Supabase pour le déploiement
- **FSRS** : utiliser l'implémentation TypeScript de `ts-fsrs` (MIT license)
- **LTI 1.3** : utiliser `ltijs` (npm) comme base pour l'implémentation
- **xAPI** : utiliser `@xapi/xapi` ou implémentation custom légère
- **MCP SDK** : `@modelcontextprotocol/sdk` est déjà dans les dépendances (^1.27.1)
- **Evolution API** : API WhatsApp auto-hosted, nécessite une instance séparée
- **MinIO** : compatible S3, pour stocker les fichiers audio/image/vidéo générés
- **Redis** : cache pour les sessions, rate limiting, et queue de notifications

## Success Metrics

- **i18n** : 100% des clés traduites en FR et AR, 0 texte chinois visible dans l'UI
- **TTS** : score MOS (Mean Opinion Score) > 4.0/5.0 pour les voix FR et AR
- **MCP** : au moins 3 serveurs MCP externes connectables (NotebookLM, Notion, Drive)
- **Spaced Repetition** : taux de rétention à 30 jours > 70% (vs ~40% sans SR)
- **LTI** : intégration fonctionnelle testée avec Moodle et Canvas
- **Organisations** : une organisation peut créer, partager et gérer 100+ classrooms
- **Docker** : déploiement complet en < 10 minutes avec `docker compose up`

## Open Questions

1. Faut-il implémenter un rate limiter côté serveur pour les clés TTS mutualisées ? (Probablement oui — Redis + token bucket)
2. Quel est le seuil de données minimum pour activer le Pedagogy Genome ? (Proposition : 100 sessions/sujet)
3. Faut-il un CDN devant MinIO pour les assets statiques ? (Dépend du volume)
4. Comment gérer le voice cloning pour des agents custom ? (ElevenLabs Professional Voice Cloning API ?)
5. Faut-il supporter le Darija écrit (en alphabet latin / "arabizi") dans le chat ? (Cas d'usage réel au Maroc)

[/PRD]
