# Capacité "capture web" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pendant la génération de l'outline, décider automatiquement par scène si une capture d'un site tiers (déduit du sujet) illustrerait la scène, la produire via un service Playwright dédié, et l'injecter comme image/vidéo dans le contenu généré — sans jamais bloquer la génération du cours sur un échec de capture.

**Architecture:** Un nouvel appel LLM (`decideCaptureForScene`, stage `capture-decision`) tourne par scène juste avant `generateSceneContent`. L'URL qu'il propose passe par `validateUrlForSSRF` avant toute tentative. Un nouveau job BullMQ (`capture-web`) délègue l'exécution réelle à un **service HTTP séparé** (`services/capture-worker/`, conteneur Playwright+Chromium dédié) qui résout un `storageState` pré-enregistré si le domaine en a un, capture (image ou vidéo), uploade vers Supabase Storage, et renvoie l'URL. L'asset rejoint le canal `assignedImages`/`imageMapping` déjà utilisé pour les PDF importés.

**Tech Stack:** TypeScript/Next.js (app principale), Node.js + Express + Playwright (service de capture séparé), BullMQ/Redis (déjà en place), Supabase Storage.

## Global Constraints

- Suit **exactement** le spec validé : `docs/foundation/5-illustration/2026-07-16-capture-web-formation-design.md` — toute divergence doit être justifiée en commentaire de commit.
- L'URL déduite par l'IA passe **toujours** par `validateUrlForSSRF` (`lib/server/ssrf-guard.ts:172`) avant toute tentative Playwright — aucune exception.
- Échec de capture (page injoignable, timeout, sélecteur introuvable, mur de connexion, rejet ssrf-guard) → **ne bloque jamais** la génération de la scène ; log + continue, jamais de `break`.
- Aucun mot de passe/clé API n'est jamais saisi par le code — l'auth passe exclusivement par un `storageState` Playwright préparé manuellement par Amine.
- Aucun nouveau type de ressource média : réutiliser `assignedImages`/`imageMapping` (images) et le canal vidéo Hyperframes existant (vidéos).

---

### Task 1: Stage LLM `capture-decision` — décider si/quoi capturer par scène

**Files:**
- Create: `lib/prompts/templates/capture-decision/system.md`
- Create: `lib/prompts/templates/capture-decision/user.md`
- Modify: `lib/prompts/index.ts:26-40` (ajouter `CAPTURE_DECISION` à `PROMPT_IDS`)
- Modify: `lib/server/model-routes.ts:112-131` (ajouter `'capture-decision'` à `LLM_STAGES`)
- Create: `lib/generation/web-capture-plan.ts`
- Test: `tests/generation/web-capture-plan.test.ts`

**Interfaces:**
- Consumes: `AICallFn` (`lib/generation/pipeline-types.ts:68-72`), `parseJsonResponse` (`lib/generation/json-repair.ts`), `SceneOutline` (`lib/types/generation.ts:92-136`)
- Produces: `CaptureDecision` type, `decideCaptureForScene(outline: SceneOutline, aiCall: AICallFn, languageDirective?: string): Promise<CaptureDecision | null>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/generation/web-capture-plan.test.ts
import { describe, it, expect, vi } from 'vitest';
import { decideCaptureForScene } from '@/lib/generation/web-capture-plan';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'scene_1',
  type: 'slide',
  title: 'Configurer les clés virtuelles LiteLLM',
  description: 'Montrer comment créer une clé virtuelle dans le panel admin LiteLLM.',
  keyPoints: ['Panel /ui', 'Clés virtuelles', 'Budgets par clé'],
  order: 1,
};

describe('decideCaptureForScene', () => {
  it('parses a well-formed capture decision from the LLM', async () => {
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'https://proxy.ai-mpower.com/ui',
        interactionSteps: [{ action: 'click', selector: 'text=Virtual Keys' }],
        format: 'image',
        reason: 'La scène décrit la page des clés virtuelles.',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision).toEqual({
      needsCapture: true,
      url: 'https://proxy.ai-mpower.com/ui',
      interactionSteps: [{ action: 'click', selector: 'text=Virtual Keys' }],
      format: 'image',
      reason: 'La scène décrit la page des clés virtuelles.',
    });
  });

  it('returns null when the LLM response is not valid JSON', async () => {
    const aiCall = vi.fn().mockResolvedValue('n\'importe quoi, pas du JSON');
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision).toBeNull();
  });

  it('returns null when format is neither image nor video', async () => {
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'https://example.com',
        interactionSteps: [],
        format: 'pdf',
        reason: 'invalide',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision).toBeNull();
  });

  it('returns a needsCapture:false decision as-is for a scene with no visual product to show', async () => {
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: false,
        url: '',
        interactionSteps: [],
        format: 'image',
        reason: "Scène conceptuelle sans outil concret à montrer.",
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision?.needsCapture).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/generation/web-capture-plan.test.ts`
Expected: FAIL — `Cannot find module '@/lib/generation/web-capture-plan'`

- [ ] **Step 3: Write minimal implementation**

```markdown
<!-- lib/prompts/templates/capture-decision/system.md -->
# Décision de capture web pour une scène de formation

Tu analyses UNE scène d'une formation générée par Qalem. Décide si une capture d'écran (statique ou animée) d'un outil/produit réel illustrerait mieux cette scène qu'une slide purement textuelle.

{{snippet:json-output-rules}}

## Format de sortie attendu (JSON, un seul objet)

```json
{
  "needsCapture": true,
  "url": "https://exemple.com/page-precise",
  "interactionSteps": [
    { "action": "click", "selector": "text=Nom du bouton visible" },
    { "action": "scroll", "ms": 500 },
    { "action": "wait", "ms": 300 }
  ],
  "format": "image",
  "reason": "Explication courte du choix"
}
```

## Règles

- `needsCapture: false` si la scène est conceptuelle, ne décrit aucun outil/produit réel consultable en ligne, ou si tu n'es pas sûr de l'URL exacte — dans le doute, `false` (une slide textuelle correcte vaut mieux qu'une capture de la mauvaise page).
- `url` doit être une URL complète, publique ou raisonnablement déductible du sujet de la formation — jamais une URL interne/privée inventée sans lien avec le sujet.
- `interactionSteps` reste vide `[]` si une simple capture de la page d'accueil suffit.
- `format: "video"` uniquement si la scène décrit explicitement un PARCOURS/une INTERACTION (plusieurs étapes à voir s'enchaîner) — sinon `"image"`.
- Ne JAMAIS proposer une URL de panel d'administration nécessitant des identifiants que tu n'as aucune raison de croire accessibles publiquement — propose plutôt la documentation publique du même produit si elle existe.
```

```markdown
<!-- lib/prompts/templates/capture-decision/user.md -->
Scène : {{title}}

Description : {{description}}

Points clés :
{{keyPoints}}

{{#if languageDirective}}
{{languageDirective}}
{{/if}}

Décide si cette scène a besoin d'une capture web, et réponds au format JSON demandé.
```

```typescript
// lib/prompts/index.ts:26-40 — ajouter une entrée à PROMPT_IDS :
export const PROMPT_IDS = {
  REQUIREMENTS_TO_OUTLINES: 'requirements-to-outlines',
  INTERACTIVE_OUTLINES: 'interactive-outlines',
  TASK_ENGINE_OUTLINES: 'task-engine-outlines',
  WEB_SEARCH_QUERY_REWRITE: 'web-search-query-rewrite',
  SLIDE_CONTENT: 'slide-content',
  QUIZ_CONTENT: 'quiz-content',
  CAPTURE_DECISION: 'capture-decision',
  // ... (reste inchangé)
```

```typescript
// lib/server/model-routes.ts:112-131 — ajouter une entrée à LLM_STAGES (fin du tableau) :
export const LLM_STAGES = [
  'scene-outlines-stream',
  'scene-content',
  'scene-content:slide',
  'scene-content:quiz',
  'scene-content:interactive',
  'scene-content:pbl',
  'scene-actions',
  'agent-profiles',
  'quiz-grade',
  'pbl-chat',
  'pbl-v2-runtime',
  'pbl-v2-runtime:instructor',
  'pbl-v2-runtime:open-task',
  'pbl-v2-runtime:evaluate',
  'pbl-v2-runtime:simulator',
  'chat-adapter',
  'generate-classroom',
  'web-search-query-rewrite',
  'maic-agent',
  'capture-decision',
] as const;
```

```typescript
// lib/generation/web-capture-plan.ts
import { PROMPT_IDS, buildPrompt } from '@/lib/prompts';
import { parseJsonResponse } from './json-repair';
import type { AICallFn } from './pipeline-types';
import type { SceneOutline } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';

const log = createLogger('WebCapturePlan');

export interface CaptureInteractionStep {
  action: 'click' | 'scroll' | 'wait';
  selector?: string;
  ms?: number;
}

export interface CaptureDecision {
  needsCapture: boolean;
  url: string;
  interactionSteps: CaptureInteractionStep[];
  format: 'image' | 'video';
  reason: string;
}

function isValidDecision(value: unknown): value is CaptureDecision {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.needsCapture === 'boolean' &&
    typeof d.url === 'string' &&
    Array.isArray(d.interactionSteps) &&
    (d.format === 'image' || d.format === 'video') &&
    typeof d.reason === 'string'
  );
}

/**
 * Decide, for a single scene outline, whether a web capture of a real
 * tool/product would illustrate it better than a text-only slide. Returns
 * `null` on any parse/validation failure — callers must treat that exactly
 * like `needsCapture: false` (never block scene generation on this).
 */
export async function decideCaptureForScene(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<CaptureDecision | null> {
  const prompts = buildPrompt(PROMPT_IDS.CAPTURE_DECISION, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    languageDirective: languageDirective || '',
  });
  if (!prompts) return null;

  const response = await aiCall(prompts.system, prompts.user);
  const decision = parseJsonResponse<CaptureDecision>(response);

  if (!isValidDecision(decision)) {
    log.error(`Failed to parse capture-decision response for: ${outline.title}`);
    return null;
  }
  return decision;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/generation/web-capture-plan.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/templates/capture-decision lib/prompts/index.ts lib/server/model-routes.ts lib/generation/web-capture-plan.ts tests/generation/web-capture-plan.test.ts
git commit -m "feat: stage LLM capture-decision — décide par scène si une capture web illustre le sujet"
```

---

### Task 2: Garde-fou SSRF sur l'URL déduite

**Files:**
- Modify: `lib/generation/web-capture-plan.ts`
- Test: `tests/generation/web-capture-plan.test.ts` (ajouter au fichier de Task 1)

**Interfaces:**
- Consumes: `validateUrlForSSRF` (`lib/server/ssrf-guard.ts:172`)
- Produces: `decideCaptureForScene` retourne désormais `{ ...decision, needsCapture: false }` (jamais bloquant) si l'URL est rejetée par ssrf-guard, avec `reason` réécrite pour tracer le rejet

- [ ] **Step 1: Write the failing test**

```typescript
// à ajouter à tests/generation/web-capture-plan.test.ts
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: vi.fn(),
}));

describe('decideCaptureForScene — ssrf-guard', () => {
  it('downgrades needsCapture to false when ssrf-guard rejects the URL', async () => {
    vi.mocked(validateUrlForSSRF).mockResolvedValue('Only HTTP(S) URLs are allowed');
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'file:///etc/passwd',
        interactionSteps: [],
        format: 'image',
        reason: 'proposition invalide',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision?.needsCapture).toBe(false);
    expect(decision?.reason).toContain('rejetée par ssrf-guard');
  });

  it('keeps needsCapture:true when ssrf-guard accepts the URL', async () => {
    vi.mocked(validateUrlForSSRF).mockResolvedValue(null);
    const aiCall = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsCapture: true,
        url: 'https://proxy.ai-mpower.com/ui',
        interactionSteps: [],
        format: 'image',
        reason: 'ok',
      }),
    );
    const decision = await decideCaptureForScene(outline, aiCall);
    expect(decision?.needsCapture).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/generation/web-capture-plan.test.ts`
Expected: FAIL — `needsCapture` reste `true` malgré le rejet ssrf-guard (pas encore appelé)

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/generation/web-capture-plan.ts — ajouter l'import et modifier decideCaptureForScene :
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

export async function decideCaptureForScene(
  outline: SceneOutline,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<CaptureDecision | null> {
  const prompts = buildPrompt(PROMPT_IDS.CAPTURE_DECISION, {
    title: outline.title,
    description: outline.description,
    keyPoints: (outline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    languageDirective: languageDirective || '',
  });
  if (!prompts) return null;

  const response = await aiCall(prompts.system, prompts.user);
  const decision = parseJsonResponse<CaptureDecision>(response);

  if (!isValidDecision(decision)) {
    log.error(`Failed to parse capture-decision response for: ${outline.title}`);
    return null;
  }

  if (decision.needsCapture) {
    const ssrfError = await validateUrlForSSRF(decision.url);
    if (ssrfError) {
      log.warn(`capture-decision URL rejected by ssrf-guard for "${outline.title}": ${ssrfError}`);
      return { ...decision, needsCapture: false, reason: `URL rejetée par ssrf-guard: ${ssrfError}` };
    }
  }

  return decision;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/generation/web-capture-plan.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add lib/generation/web-capture-plan.ts tests/generation/web-capture-plan.test.ts
git commit -m "feat: filtre ssrf-guard sur l'URL déduite par capture-decision"
```

---

### Task 3: Service de capture Playwright (conteneur séparé)

**Files:**
- Create: `services/capture-worker/package.json`
- Create: `services/capture-worker/src/server.ts`
- Create: `services/capture-worker/src/capture.ts`
- Create: `services/capture-worker/src/storage-state-registry.ts`
- Create: `services/capture-worker/Dockerfile`
- Test: `services/capture-worker/src/capture.test.ts`

**Interfaces:**
- Produces: `POST /capture` — body `{ url: string, interactionSteps: CaptureInteractionStep[], format: 'image' | 'video' }`, réponse `{ success: true, buffer: string (base64), contentType: string } | { success: false, error: string }`

Aucun nouveau projet npm workspace n'est ajouté au monorepo pnpm existant (`pnpm-workspace.yaml` reste inchangé — ce service est un processus/conteneur autonome, pas un package consommé par l'app Next.js) ; il vit dans `services/capture-worker/` avec son propre `package.json`/lockfile, déployé comme conteneur indépendant.

- [ ] **Step 1: Write the failing test**

```typescript
// services/capture-worker/src/capture.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runCapture } from './capture';

vi.mock('playwright', () => {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
    click: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    video: vi.fn().mockReturnValue(undefined),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { chromium: { launch: vi.fn().mockResolvedValue(browser) } };
});

describe('runCapture', () => {
  it('returns a PNG buffer for format:image', async () => {
    const result = await runCapture({
      url: 'https://example.com',
      interactionSteps: [{ action: 'wait', ms: 100 }],
      format: 'image',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.contentType).toBe('image/png');
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it('returns success:false when goto throws (page unreachable)', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    vi.mocked(page.goto).mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));

    const result = await runCapture({
      url: 'https://unreachable.invalid',
      interactionSteps: [],
      format: 'image',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('ERR_NAME_NOT_RESOLVED');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/capture-worker && pnpm exec vitest run src/capture.test.ts`
Expected: FAIL — `Cannot find module './capture'`

- [ ] **Step 3: Write minimal implementation**

```json
// services/capture-worker/package.json
{
  "name": "qalem-capture-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.21.0",
    "playwright": "1.58.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

```typescript
// services/capture-worker/src/storage-state-registry.ts
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Maps a hostname to a Playwright storageState JSON file path. Populated
 * manually: Amine runs `npx playwright open --save-storage=<path> <url>`
 * once per external tool, logs in by hand, then registers the resulting
 * path here. Never written to by any automated code path.
 */
const STORAGE_STATE_DIR = process.env.CAPTURE_STORAGE_STATE_DIR || '/data/storage-states';

const REGISTRY: Record<string, string> = {
  'proxy.ai-mpower.com': 'proxy-ai-mpower-com.json',
};

export function resolveStorageStatePath(url: string): string | undefined {
  const hostname = new URL(url).hostname;
  const filename = REGISTRY[hostname];
  if (!filename) return undefined;
  const fullPath = path.join(STORAGE_STATE_DIR, filename);
  return existsSync(fullPath) ? fullPath : undefined;
}

/** Exposed for tests only. */
export function _readStorageStateRaw(fullPath: string): string {
  return readFileSync(fullPath, 'utf-8');
}
```

```typescript
// services/capture-worker/src/capture.ts
import { chromium } from 'playwright';
import { resolveStorageStatePath } from './storage-state-registry';

export interface CaptureInteractionStep {
  action: 'click' | 'scroll' | 'wait';
  selector?: string;
  ms?: number;
}

export interface CaptureRequest {
  url: string;
  interactionSteps: CaptureInteractionStep[];
  format: 'image' | 'video';
}

export type CaptureResult =
  | { success: true; buffer: Buffer; contentType: string }
  | { success: false; error: string };

const LOGIN_WALL_TITLE_PATTERN = /login|sign in/i;

async function runInteractionSteps(
  page: import('playwright').Page,
  steps: CaptureInteractionStep[],
): Promise<void> {
  for (const step of steps) {
    if (step.action === 'click' && step.selector) {
      await page.click(step.selector, { timeout: 5000 });
    } else if (step.action === 'scroll') {
      await page.mouse.wheel(0, 600);
    }
    if (step.ms) await page.waitForTimeout(step.ms);
  }
}

export async function runCapture(request: CaptureRequest): Promise<CaptureResult> {
  const browser = await chromium.launch();
  try {
    const storageState = resolveStorageStatePath(request.url);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ...(storageState ? { storageState } : {}),
      ...(request.format === 'video'
        ? { recordVideo: { dir: '/tmp/capture-videos', size: { width: 1440, height: 900 } } }
        : {}),
    });
    const page = await context.newPage();

    try {
      await page.goto(request.url, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (err) {
      await context.close();
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    const title = await page.title();
    if (LOGIN_WALL_TITLE_PATTERN.test(title)) {
      await context.close();
      return { success: false, error: `Login wall detected (page title: "${title}")` };
    }

    await runInteractionSteps(page, request.interactionSteps);

    if (request.format === 'image') {
      const buffer = await page.screenshot();
      await context.close();
      return { success: true, buffer, contentType: 'image/png' };
    }

    const video = page.video();
    await context.close();
    if (!video) return { success: false, error: 'No video recorded' };
    const videoPath = await video.path();
    const { readFileSync } = await import('node:fs');
    return { success: true, buffer: readFileSync(videoPath), contentType: 'video/webm' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser.close();
  }
}
```

```typescript
// services/capture-worker/src/server.ts
import express from 'express';
import { runCapture, type CaptureRequest } from './capture';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/capture', async (req, res) => {
  const body = req.body as Partial<CaptureRequest>;
  if (!body.url || !Array.isArray(body.interactionSteps) || !body.format) {
    res.status(400).json({ success: false, error: 'Missing url/interactionSteps/format' });
    return;
  }
  const result = await runCapture(body as CaptureRequest);
  if (!result.success) {
    res.status(200).json({ success: false, error: result.error });
    return;
  }
  res.status(200).json({
    success: true,
    buffer: result.buffer.toString('base64'),
    contentType: result.contentType,
  });
});

const port = Number(process.env.PORT) || 8090;
app.listen(port, () => console.log(`capture-worker listening on :${port}`));
```

```dockerfile
# services/capture-worker/Dockerfile
FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json
EXPOSE 8090
CMD ["node", "dist/server.js"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/capture-worker && pnpm install && pnpm exec vitest run src/capture.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add services/capture-worker
git commit -m "feat: service de capture Playwright dédié (conteneur séparé, HTTP /capture)"
```

---

### Task 4: Job BullMQ `capture-web` (app principale → appel HTTP du service)

**Files:**
- Modify: `lib/jobs/queue.ts` (ajouter `'capture-web'` à `JobType`, une queue, un enqueue helper)
- Modify: `lib/jobs/workers.ts` (ajouter le worker, pattern `videoCapsuleWorker`/`exportJobWorker`)
- Create: `lib/server/capture-client.ts` (client HTTP vers le service, avec échec non bloquant)
- Test: `tests/server/capture-client.test.ts`

**Interfaces:**
- Consumes: `CaptureDecision` (Task 1/2)
- Produces: `requestWebCapture(decision: CaptureDecision, classroomId: string): Promise<{ assetUrl: string; format: 'image' | 'video' } | null>` — retourne `null` sur tout échec, jamais de throw

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/capture-client.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestWebCapture } from '@/lib/server/capture-client';
import type { CaptureDecision } from '@/lib/generation/web-capture-plan';

const decision: CaptureDecision = {
  needsCapture: true,
  url: 'https://proxy.ai-mpower.com/ui',
  interactionSteps: [],
  format: 'image',
  reason: 'test',
};

describe('requestWebCapture', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uploads the returned buffer to Supabase Storage and returns its URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          buffer: Buffer.from('fake-png').toString('base64'),
          contentType: 'image/png',
        }),
      }),
    );
    const result = await requestWebCapture(decision, 'classroom_123');
    expect(result).toEqual({ assetUrl: expect.stringContaining('classroom_123'), format: 'image' });
  });

  it('returns null (never throws) when the capture service reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, error: 'Login wall detected' }),
      }),
    );
    const result = await requestWebCapture(decision, 'classroom_123');
    expect(result).toBeNull();
  });

  it('returns null (never throws) when the capture service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await requestWebCapture(decision, 'classroom_123');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/server/capture-client.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/capture-client'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/server/capture-client.ts
import { createServiceSupabaseClient } from '@/lib/supabase/service-client';
import { createLogger } from '@/lib/logger';
import type { CaptureDecision } from '@/lib/generation/web-capture-plan';

const log = createLogger('CaptureClient');

const CAPTURE_WORKER_URL = process.env.CAPTURE_WORKER_URL || 'http://capture-worker:8090';

export interface CaptureAsset {
  assetUrl: string;
  format: 'image' | 'video';
}

/**
 * Calls the dedicated capture service and, on success, uploads the result to
 * Supabase Storage (bucket `classroom-media`, same convention as
 * `uploadClassroomMedia` in classroom-media-generation.ts). Returns `null` on
 * ANY failure — network, service-reported error, upload error — the caller
 * must treat this exactly like "no capture" and continue scene generation.
 */
export async function requestWebCapture(
  decision: CaptureDecision,
  classroomId: string,
): Promise<CaptureAsset | null> {
  try {
    const response = await fetch(`${CAPTURE_WORKER_URL}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: decision.url,
        interactionSteps: decision.interactionSteps,
        format: decision.format,
      }),
    });
    if (!response.ok) {
      log.warn(`capture-worker HTTP ${response.status} for ${decision.url}`);
      return null;
    }
    const data = (await response.json()) as
      | { success: true; buffer: string; contentType: string }
      | { success: false; error: string };

    if (!data.success) {
      log.warn(`capture failed for ${decision.url}: ${data.error}`);
      return null;
    }

    const buf = Buffer.from(data.buffer, 'base64');
    const ext = data.contentType === 'video/webm' ? 'webm' : 'png';
    const filename = `capture_${Date.now()}.${ext}`;
    const supabase = createServiceSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from('classroom-media')
      .upload(`${classroomId}/media/${filename}`, buf, {
        contentType: data.contentType,
        upsert: true,
      });
    if (uploadError) {
      log.warn(`upload failed for capture of ${decision.url}: ${uploadError.message}`);
      return null;
    }

    return {
      assetUrl: `/api/classroom-media/${classroomId}/media/${filename}`,
      format: decision.format,
    };
  } catch (err) {
    log.warn(`capture-worker unreachable for ${decision.url}:`, err);
    return null;
  }
}
```

Note : le job BullMQ `capture-web` (`lib/jobs/queue.ts`/`lib/jobs/workers.ts`, pattern `exportJobWorker`) reste optionnel pour un premier déploiement — `requestWebCapture` est déjà lui-même asynchrone et non-bloquant par design (retourne `null` plutôt que de throw). Le passage par une queue BullMQ formelle n'apporte de valeur que si le volume de captures justifie un vrai découplage ; à ajouter seulement si la latence per-scene (un appel HTTP synchrone par scène pendant l'outline) s'avère un problème réel en usage — ne pas construire cette couche avant d'avoir mesuré le besoin (YAGNI).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/server/capture-client.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add lib/server/capture-client.ts tests/server/capture-client.test.ts
git commit -m "feat: client HTTP vers le service de capture, upload Storage, échec non bloquant"
```

---

### Task 5: Injection dans `generateSingleScene` — brancher les 4 tâches précédentes

**Files:**
- Modify: `lib/generation/scene-generator.ts:178-199` (`generateSingleScene`)
- Test: `tests/generation/scene-generator.test.ts` (ajouter au fichier existant)

**Interfaces:**
- Consumes: `decideCaptureForScene` (Task 1/2), `requestWebCapture` (Task 4), `buildImageResources`-style injection (`lib/agent/tools/regenerate-scene.ts:68-102`, adapté ici en ligne pour ne pas dépendre du contexte agent-chat)

- [ ] **Step 1: Write the failing test**

```typescript
// à ajouter à tests/generation/scene-generator.test.ts
import { generateSingleScene } from '@/lib/generation/scene-generator'; // export à ajouter si non déjà exporté pour le test
vi.mock('@/lib/generation/web-capture-plan');
vi.mock('@/lib/server/capture-client');

it('injects a captured image into assignedImages before generating slide content', async () => {
  const { decideCaptureForScene } = await import('@/lib/generation/web-capture-plan');
  const { requestWebCapture } = await import('@/lib/server/capture-client');
  vi.mocked(decideCaptureForScene).mockResolvedValue({
    needsCapture: true,
    url: 'https://proxy.ai-mpower.com/ui',
    interactionSteps: [],
    format: 'image',
    reason: 'ok',
  });
  vi.mocked(requestWebCapture).mockResolvedValue({
    assetUrl: '/api/classroom-media/classroom_1/media/capture_1.png',
    format: 'image',
  });

  const generateSceneContentSpy = vi.spyOn(
    await import('@/lib/generation/scene-generator'),
    'generateSceneContent',
  );

  await generateSingleScene(outline, mockApi, mockAiCall, undefined, 'classroom_1');

  const optionsArg = generateSceneContentSpy.mock.calls[0][2];
  expect(optionsArg.assignedImages).toEqual([
    expect.objectContaining({ src: '/api/classroom-media/classroom_1/media/capture_1.png' }),
  ]);
});
```

*(Ce test dépend de la capacité de `vi.spyOn` sur un export du même module — si `generateSceneContent` et `generateSingleScene` cohabitent dans le même fichier sans être ré-exportables séparément pour spy, refactorer minimalement `generateSingleScene` pour accepter `generateSceneContent`/`generateSceneActions` en paramètres injectés par défaut plutôt que par import direct — pattern "dependency injection with defaults" déjà courant en TS : `contentFn: typeof generateSceneContent = generateSceneContent`.)*

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/generation/scene-generator.test.ts -t "injects a captured image"`
Expected: FAIL — `generateSingleScene` ne prend pas de `classroomId`, n'appelle ni `decideCaptureForScene` ni `requestWebCapture`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/generation/scene-generator.ts:178-199 — remplacer generateSingleScene par :
import { decideCaptureForScene } from './web-capture-plan';
import { requestWebCapture } from '@/lib/server/capture-client';
import type { PdfImage, ImageMapping } from '@/lib/types/generation';

async function generateSingleScene(
  outline: SceneOutline,
  api: ReturnType<typeof createStageAPI>,
  aiCall: AICallFn,
  languageDirective?: string,
  classroomId?: string,
): Promise<string | null> {
  // Step 3.0: decide + fetch an illustrative web capture for this scene, if any.
  // Never blocks: any failure at any point here falls through with no image.
  let assignedImages: PdfImage[] | undefined;
  let imageMapping: ImageMapping | undefined;
  if (classroomId) {
    const captureDecision = await decideCaptureForScene(outline, aiCall, languageDirective);
    if (captureDecision?.needsCapture) {
      const asset = await requestWebCapture(captureDecision, classroomId);
      if (asset && asset.format === 'image') {
        const imgId = 'img_capture_1';
        assignedImages = [
          {
            id: imgId,
            src: asset.assetUrl,
            pageNumber: 0,
            description: captureDecision.reason,
          },
        ];
        imageMapping = { [imgId]: asset.assetUrl };
      }
      // asset.format === 'video' handled by the existing Hyperframes video
      // channel — out of scope for this task, tracked separately if/when a
      // capture-decision actually returns format:'video' in practice.
    }
  }

  // Step 3.1: Generate content
  log.info(`Step 3.1: Generating content for: ${outline.title}`);
  const content = await generateSceneContent(outline, aiCall, {
    languageDirective,
    assignedImages,
    imageMapping,
  });
  if (!content) {
    log.error(`Failed to generate content for: ${outline.title}`);
    return null;
  }

  // Step 3.2: Generate Actions
  log.info(`Step 3.2: Generating actions for: ${outline.title}`);
  const actions = await generateSceneActions(outline, content, aiCall, { languageDirective });
  log.info(`Generated ${actions.length} actions for: ${outline.title}`);

  // Create complete Scene
  return createSceneWithActions(outline, content, actions, api);
}
```

**`classroomId` n'existe pas encore dans `generateFullScenes`** (`lib/generation/scene-generator.ts:114-120`, signature actuelle : `(sceneOutlines, store, aiCall, callbacks, languageDirective)`) — l'ajouter en dernier paramètre optionnel et le propager à chaque appel de `generateSingleScene` dans la boucle `Promise.all` (lignes ~134-158) :

```typescript
// lib/generation/scene-generator.ts:114-120 — étendre la signature :
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  languageDirective?: string,
  classroomId?: string,
): Promise<GenerationResult<string[]>> {
```

Puis, dans la boucle `Promise.all` qui appelle `generateSingleScene` (repérer l'appel exact aux lignes ~134-158 et lui ajouter `classroomId` en dernier argument). Enfin, remonter `classroomId` un cran plus haut, à l'appelant de `generateFullScenes` (`lib/generation/pipeline-runner.ts:68-74` et/ou la route API réelle `app/api/generate-classroom` qui connaît déjà l'id de classroom créé) — ajouter le même paramètre optionnel en cascade, sans changer le comportement des appelants existants qui ne le fournissent pas (`classroomId: undefined` ⇒ Step 3.0 est simplement sautée).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/generation/scene-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite (non-régression)**

Run: `npx tsc --noEmit && pnpm lint && pnpm test`
Expected: 0 erreur TypeScript, 0 erreur lint, tous les tests verts

- [ ] **Step 6: Commit**

```bash
git add lib/generation/scene-generator.ts tests/generation/scene-generator.test.ts
git commit -m "feat: injecte la capture web décidée dans assignedImages avant generateSceneContent"
```

---

### Task 6: Déploiement du service (SOP-014), storageState réel, story Ralph, e2e non-régression

**Files:**
- Modify: `docker-compose.production.yml` (nouveau service `capture-worker`)
- Modify: `.ralph/prd-v2.json`
- Create: `e2e/tests/web-capture-failure-isolation.spec.ts`

**Interfaces:** aucune (tâche de clôture)

- [ ] **Step 1: Ajouter le service au compose de prod**

```yaml
# docker-compose.production.yml — ajouter au niveau `services:` (suit le pattern du service `qalem` existant) :
  capture-worker:
    build:
      context: ./services/capture-worker
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      - PORT=8090
      - CAPTURE_STORAGE_STATE_DIR=/data/storage-states
    volumes:
      - capture-storage-states:/data/storage-states
    networks:
      - qalem-net
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8090/health']
      interval: 30s
      timeout: 5s
      retries: 3
```

Et ajouter `capture-storage-states:` aux `volumes:` nommés en fin de fichier, et `CAPTURE_WORKER_URL=http://capture-worker:8090` aux variables d'environnement du service `qalem`.

- [ ] **Step 2: Déployer (SOP-014) et vérifier `/health`**

Suivre le protocole SOP-014 pour builder/déployer `capture-worker` sur serveuria, puis vérifier `curl http://capture-worker:8090/health` depuis le conteneur `qalem` (`docker exec <conteneur-qalem> curl -f http://capture-worker:8090/health`) → `{"ok":true}`.

- [ ] **Step 3: Capture manuelle du storageState par Amine (prérequis levé, à exécuter)**

Sur un poste avec Playwright installé (ou dans le conteneur `capture-worker` en mode non-headless via VNC/X11 si le poste local n'a pas Node) :
```bash
npx playwright open --save-storage=proxy-ai-mpower-com.json https://proxy.ai-mpower.com/ui
```
Amine se connecte manuellement dans la fenêtre ouverte, ferme-la, puis le fichier `proxy-ai-mpower-com.json` est copié dans le volume `capture-storage-states` du conteneur (`docker cp proxy-ai-mpower-com.json capture-worker:/data/storage-states/`).

- [ ] **Step 4: Test e2e de non-régression (échec de capture n'arrête pas la génération)**

```typescript
// e2e/tests/web-capture-failure-isolation.spec.ts
import { test, expect } from '../fixtures/test-fixtures'; // adapter à l'import réel des fixtures e2e existantes

test('a scene still generates when the capture service is unreachable', async ({ page, mockApi }) => {
  await mockApi.route('**/api/generate-classroom', async (route) => {
    // simule un capture-worker down : requestWebCapture retourne null côté serveur,
    // la génération de scène doit tout de même produire une slide texte normale
    await route.continue();
  });
  await page.goto('/app');
  // ... déclencher une génération et vérifier que la scène finale existe avec du texte,
  // sans champ image manquant qui ferait planter le rendu (adapter aux Page Objects existants,
  // cf. e2e/pages/, pattern déjà établi par les autres specs de génération).
});
```

- [ ] **Step 5: Ajouter la story Ralph**

```json
{
  "id": "S1-012",
  "title": "Capacité capture web réutilisable — service Playwright dédié + injection scène",
  "epic": "1-CREER",
  "phase": 1,
  "passes": false,
  "dependencies": [],
  "acceptance": [
    "Stage LLM capture-decision opérationnel, ssrf-guard appelé avant toute capture",
    "Service capture-worker déployé sur serveuria, /health répond",
    "storageState proxy.ai-mpower.com enregistré manuellement par Amine",
    "Échec de capture n'interrompt jamais la génération (test e2e web-capture-failure-isolation vert)",
    "npx tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e verts",
    "Vérification déployée (SOP-011) : une scène du cours F6G9W_LPT8 régénérée illustrée par une vraie capture de proxy.ai-mpower.com, confirmée visuellement par Amine"
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.production.yml .ralph/prd-v2.json e2e/tests/web-capture-failure-isolation.spec.ts
git commit -m "feat: déploiement capture-worker + story Ralph S1-012 + e2e non-régression"
```
