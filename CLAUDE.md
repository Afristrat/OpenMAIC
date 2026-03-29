# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Qalem (قلم) — fork of OpenMAIC (Open Multi-Agent Interactive Classroom). AI platform that turns any topic or document into an interactive classroom with AI teachers and classmates. Originally built by THU-MAIC, forked as Qalem for FR/AR/EN markets. Licensed AGPL-3.0.

## Commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev server | `pnpm dev` (http://localhost:3000) |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Format check | `pnpm check` |
| Typecheck | `npx tsc --noEmit` |
| Unit tests | `pnpm test` (vitest) |
| Single test | `pnpm exec vitest run path/to/file.test.ts` |
| E2E tests | `pnpm test:e2e` (Playwright, chromium) |
| E2E UI mode | `pnpm test:e2e:ui` |
| Docker | `docker compose up --build` |

CI runs: Prettier → ESLint → TypeScript → Unit Tests → E2E Tests.

## Architecture

**Stack:** Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4 + Zustand + LangGraph + AI SDK (Vercel).

**Monorepo** (pnpm workspaces): root app + `packages/mathml2omml` + `packages/pptxgenjs` (built on postinstall).

### Core Data Flow

1. **Generation pipeline** (`lib/generation/`): User requirements → outline generation → scene generation (slides, quizzes, interactive HTML, PBL). Two-stage: `outline-generator.ts` → `scene-generator.ts`, orchestrated by `pipeline-runner.ts`.

2. **Multi-agent orchestration** (`lib/orchestration/`): LangGraph `StateGraph` with a director pattern. `director-graph.ts` implements `START → director → agent_generate → director (loop) → END`. The director dispatches AI agents (teacher, classmates) via a registry (`registry/`). Streams events via SSE.

3. **Action engine** (`lib/action/engine.ts`): Unified execution layer for agent actions (spotlight, laser, speech, whiteboard drawing). Two modes: fire-and-forget (visual effects) and synchronous (speech, whiteboard). Shared by both streaming and playback paths.

4. **Stage API** (`lib/api/stage-api*.ts`): Facade over the Zustand store for scene navigation, element manipulation, canvas ops, whiteboard, and mode switching. Split into focused modules: `stage-api-canvas.ts`, `stage-api-element.ts`, `stage-api-navigation.ts`, etc.

5. **State management** (`lib/store/`): Zustand stores — `stage.ts` (scenes, navigation, mode), `canvas.ts`, `settings.ts`, `whiteboard-history.ts`, `media-generation.ts`.

6. **Playback** (`lib/playback/`): Replays recorded action sequences with timing. Uses `derived-state.ts` for computed playback state.

### API Routes (`app/api/`)

- `/api/chat` — Main multi-agent chat (SSE streaming via orchestration graph)
- `/api/generate-classroom` — Full classroom generation (creates job, polls via `/api/generate-classroom/[jobId]`)
- `/api/generate/scene-outlines-stream`, `scene-content`, `scene-actions` — Individual generation steps
- `/api/generate/tts`, `image`, `video` — Media generation
- `/api/parse-pdf` — Document parsing (supports MinerU)
- `/api/pbl/chat` — Project-based learning chat
- `/api/verify-*` — Provider verification endpoints

### Frontend Structure

- `app/classroom/` — Classroom view (main interactive experience)
- `app/generation-preview/` — Generation preview/progress page
- `components/stage.tsx` — Main stage component orchestrating the classroom
- `components/slide-renderer/` — Full slide editor/renderer with ProseMirror text editing
- `components/scene-renderers/` — Scene-type-specific renderers (PBL, etc.)
- `components/whiteboard/` — Whiteboard overlay with drawing tools
- `components/chat/` — Chat panel with SSE stream processing
- `components/roundtable/` — Multi-agent roundtable discussion UI

### Provider System

Multi-provider support configured via env vars (`{PROVIDER}_API_KEY`, `{PROVIDER}_BASE_URL`, `{PROVIDER}_MODELS`) or `server-providers.yml`. Covers LLM, TTS, ASR, PDF, image, and video providers. Provider resolution in `lib/ai/providers.ts`, audio in `lib/audio/`.

### Path Alias

`@/*` maps to project root (tsconfig paths).

## E2E Tests

Page Object Model pattern in `e2e/pages/`. Fixtures in `e2e/fixtures/` with mock API responses (`mock-api.ts`). Test data in `e2e/fixtures/test-data/`.

## Key Libraries

- **LangGraph** (`@langchain/langgraph`) — Multi-agent state graph orchestration
- **AI SDK** (`ai`, `@ai-sdk/*`) — LLM provider abstraction and streaming
- **ProseMirror** — Rich text editing in slides
- **Zustand** — State management
- **Dexie** — IndexedDB storage (client-side persistence)
- **KaTeX/Temml** — Math rendering
- **ECharts** — Chart rendering in slides
- **Sharp** — Server-side image processing
