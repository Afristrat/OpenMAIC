# Progress — Qalem (fork OpenMAIC)

## Codebase Patterns

- **i18n** : `lib/i18n/` — 5 modules (common, chat, generation, settings, stage), type Locale dans types.ts, hook useI18n dans `lib/hooks/use-i18n.tsx`, auto-détection langue navigateur
- **TTS** : Factory pattern dans `lib/audio/tts-providers.ts`, registry dans `constants.ts`, voice resolver dans `voice-resolver.ts`
- **Stores** : Zustand avec `persist` middleware, `createSelectors()` helper, pattern `useXxxStore`
- **API routes** : Next.js App Router `app/api/*/route.ts`, validation Zod, provider resolution via `lib/server/provider-config.ts`
- **Orchestration** : LangGraph StateGraph dans `lib/orchestration/director-graph.ts`, registry agents dans `lib/orchestration/registry/`
- **Génération** : Pipeline dans `lib/generation/`, prompts markdown dans `prompts/templates/`, snippets réutilisables via `{{snippet:name}}`
- **PBL MCP** : Classes internes dans `lib/pbl/mcp/` (PAS le vrai MCP Protocol), SDK `@modelcontextprotocol/sdk` installé mais inutilisé
- **Path alias** : `@/*` → project root
- **Imports** : pas de barrel files, imports directs vers les fichiers

## Known Issues

- Azure TTS hardcodé `xml:lang='zh-CN'` dans `tts-providers.ts`
- ElevenLabs : seulement 7 voix EN, pas de FR/AR
- 2 strings hardcodées en chinois dans `header.tsx` (lignes 126, 139)
- 6 agents par défaut avec noms chinois dans `registry/store.ts`
- `@modelcontextprotocol/sdk` installé mais jamais importé dans le code

## Session Log

| Date | Story | Fichiers | Learnings |
|------|-------|----------|-----------|
| — | — | — | Initialisation du Ralph Loop |
| 2026-03-29 | S-001 Rebranding → Qalem | package.json, layout.tsx, page.tsx, scene-sidebar.tsx, home.page.ts, CLAUDE.md | Soft fork : ne pas modifier README/CONTRIBUTING/CHANGELOG upstream. Le uid 'openmaic' dans tts-providers.ts est un identifiant API Doubao, pas du branding. |
| 2026-03-29 | S-002→S-007 i18n FR/AR/EN complet | lib/i18n/*.ts (5 modules), types.ts, index.ts, use-i18n.tsx, header.tsx, page.tsx, generation-toolbar.tsx, prompt-builder.ts, scene-generator.ts, scene-content/route.ts, lib/types/generation.ts | Locales fr-FR + ar-MA ajoutées. ZH-CN retiré de l'UI (reste fallback code). ~1200 lignes de traductions natives (pas mot-à-mot). Type language étendu dans generation types. Auto-détection navigateur FR/AR. Défaut changé de zh-CN à fr-FR. |
| 2026-03-29 | S-008 Agents par défaut FR/AR | lib/orchestration/registry/store.ts | Noms chinois remplacés par EN (fallback serveur). Les noms localisés FR/AR déjà dans settings.ts via agentNames. Le système agentsToParticipants() résout via t('settings.agentNames.default-X'). |
| 2026-03-29 | S-009 Support RTL arabe | components/html-direction-manager.tsx (NEW), layout.tsx, globals.css | HtmlDirectionManager client component sets dir/lang on html. CSS RTL rules: direction, text-align, ltr exceptions for code/katex/mono. rtl-flip class for directional icons. |
| 2026-03-29 | S-015 Voice-resolver locale-aware | lib/audio/voice-resolver.ts | resolveAgentVoice() prend un paramètre locale optionnel. Filtre les voix par language prefix (fr, ar, en). Fallback sur voix sans filtre si aucune voix locale. ProviderWithVoices inclut language. |
| 2026-03-29 | S-016 TTS hybride clé serveur + utilisateur | — | Déjà implémenté : resolveTTSApiKey(providerId, clientKey) dans provider-config.ts + isServerConfigured dans settings store. |
