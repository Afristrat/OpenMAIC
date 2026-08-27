import type { Page } from '@playwright/test';
import { mockOutlines } from './test-data/scene-outlines';
import { mockSceneContentResponse } from './test-data/scene-content';
import { createMockSceneActionsResponse } from './test-data/scene-actions';
import type { SceneOutline } from '../../lib/types/generation';

export interface LocalClassroomFallbackTracker {
  expectedRequests: string[];
  unexpectedRequests: string[];
}

export interface RequestBoundaryTracker {
  expectedRequests: string[];
  unexpectedRequests: string[];
}

/**
 * Wraps Playwright's page.route() to mock OpenMAIC API endpoints.
 * Supports both JSON and SSE (text/event-stream) responses.
 */
export class MockApi {
  constructor(
    private page: Page,
    private expectHttpError?: (pathname: string, status: number) => void,
  ) {}

  /**
   * Model a classroom that exists only in IndexedDB. The production client
   * must still probe its authoritative API first, receive an explicit 404,
   * then retain the local snapshot. Any other classroom request is recorded
   * and blocked so the test cannot pass after leaking into fake Supabase.
   */
  async mockLocalClassroomFallback(stageId: string): Promise<LocalClassroomFallbackTracker> {
    this.expectHttpError?.('/api/classroom', 404);
    const tracker: LocalClassroomFallbackTracker = {
      expectedRequests: [],
      unexpectedRequests: [],
    };

    await this.page.route('**/api/classroom?*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const requestLabel = `${request.method()} ${url.pathname}${url.search}`;
      const isExpected =
        request.method() === 'GET' &&
        url.searchParams.size === 1 &&
        url.searchParams.get('id') === stageId;

      if (!isExpected) {
        tracker.unexpectedRequests.push(requestLabel);
        await route.abort('blockedbyclient');
        return;
      }

      tracker.expectedRequests.push(requestLabel);
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Local E2E classroom' }),
      });
    });

    return tracker;
  }

  /** Mock the SSE outline streaming endpoint */
  async mockSceneOutlinesStream(outlines = mockOutlines) {
    await this.page.route('**/api/generate/scene-outlines-stream', (route) => {
      const events = outlines
        .map(
          (outline, i) =>
            `data: ${JSON.stringify({ type: 'outline', data: outline, index: i })}\n\n`,
        )
        .join('');
      const done = `data: ${JSON.stringify({ type: 'done', outlines, courseTitle: 'Mock Course' })}\n\n`;

      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: events + done,
      });
    });
  }

  /** Mock the scene content generation endpoint */
  async mockSceneContent(response = mockSceneContentResponse) {
    await this.page.route('**/api/generate/scene-content', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
    });
  }

  /** Mock the scene actions generation endpoint.
   *  When no stageId is provided, it is extracted from the request body
   *  so the mock response matches the dynamically-generated stage id. */
  async mockSceneActions(stageId?: string) {
    await this.page.route('**/api/generate/scene-actions', async (route) => {
      let id = stageId ?? 'test-stage';
      let outline: SceneOutline | undefined;
      try {
        const body = route.request().postDataJSON() as {
          stageId?: string;
          outline?: SceneOutline;
        };
        if (!stageId && body?.stageId) id = body.stageId;
        outline = body?.outline;
      } catch {
        // fallback to default
      }
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createMockSceneActionsResponse(id, outline)),
      });
    });
  }

  /** Keep quiz persistence inside the fake Supabase boundary used by browser tests. */
  async mockQuizPersistence(): Promise<RequestBoundaryTracker> {
    const tracker: RequestBoundaryTracker = { expectedRequests: [], unexpectedRequests: [] };
    const routeTable = async (
      table: 'review_cards' | 'quiz_results',
      allowedMethods: readonly string[],
    ) => {
      await this.page.route(`**/rest/v1/${table}*`, async (route) => {
        const request = route.request();
        const label = `${request.method()} ${new URL(request.url()).pathname}`;
        if (!allowedMethods.includes(request.method())) {
          tracker.unexpectedRequests.push(label);
          await route.abort('blockedbyclient');
          return;
        }
        tracker.expectedRequests.push(label);
        await route.fulfill({
          status: request.method() === 'GET' || request.method() === 'HEAD' ? 200 : 201,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0' },
          body: request.method() === 'HEAD' ? '' : '[]',
        });
      });
    };

    await routeTable('review_cards', ['GET', 'HEAD', 'POST']);
    await routeTable('quiz_results', ['POST']);
    return tracker;
  }

  /** Mock one usable managed LLM while keeping every unrelated modality empty. */
  async mockServerProviders() {
    await this.page.route('**/api/server-providers', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          providers: { openai: { models: ['gpt-4o-mini'] } },
          tts: {},
          asr: {},
          pdf: {},
          image: {},
          video: {},
          webSearch: {},
          generation: { parallelSceneConcurrency: 0 },
        }),
      });
    });
  }

  /** Stateful organization source library used by authoring-home tests. */
  async mockSourceLibrary() {
    const sources: Array<{
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
      status: 'ready';
      content: { text: string; images: unknown[] };
    }> = [];
    let manifest: { id: string; version: number; sourceIds: string[] } | null = null;
    let sourceSequence = 0;
    let manifestSequence = 0;

    await this.page.route('**/api/source-library?*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, sources }),
      });
    });
    await this.page.route('**/api/source-library', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON() as {
        name: string;
        mimeType: string;
        sizeBytes: number;
        content: { text: string; images: unknown[] };
      };
      const duplicate = sources.find((source) => source.content.text === body.content.text);
      const source = duplicate ?? {
        id: `10000000-0000-4000-8000-${String(++sourceSequence).padStart(12, '0')}`,
        name: body.name,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        status: 'ready' as const,
        content: body.content,
      };
      if (!duplicate) sources.push(source);
      await route.fulfill({
        status: duplicate ? 200 : 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, source, duplicate: !!duplicate }),
      });
    });
    await this.page.route('**/api/source-manifests?*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, manifest }),
      });
    });
    await this.page.route('**/api/source-manifests', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON() as { sourceIds: string[] };
      manifestSequence += 1;
      manifest = {
        id: `20000000-0000-4000-8000-${String(manifestSequence).padStart(12, '0')}`,
        version: manifestSequence,
        sourceIds: body.sourceIds,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, manifest }),
      });
    });

    return {
      getSources: () => [...sources],
      getManifest: () => manifest,
    };
  }

  /** Mock the persistent classroom-generation handoff used by the home page. */
  async mockClassroomGenerationJob(jobId = 'e2e-generation-job', resultUrl?: string) {
    let submittedBody: unknown;
    let planRequestBody: unknown;
    const planJobId = `plan-${jobId}`;
    await this.page.route('**/api/generate-classroom/plan', async (route) => {
      planRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          jobId: planJobId,
          pollIntervalMs: 10,
        }),
      });
    });
    await this.page.route(`**/api/generate-classroom/plan/${planJobId}`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          jobId: planJobId,
          status: 'succeeded',
          done: true,
          generationRequest: planRequestBody,
          result: {
            courseTitle: 'E2E approved plan',
            languageDirective: 'Teach in English.',
            syllabus: {
              audience: 'Store managers',
              prerequisites: 'No prerequisite',
              overallObjective: 'Prevent till discrepancies',
              learningObjectives: ['Identify a discrepancy', 'Apply the closing procedure'],
              totalDurationMinutes: 45,
              deliveryMode: 'Interactive virtual classroom',
              assessmentStrategy: 'Observed case resolution',
              expectedDeliverable: 'Completed closing checklist',
            },
            outlines: mockOutlines,
          },
        }),
      });
    });
    await this.page.route('**/api/generate-classroom', async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, jobId }),
      });
    });
    await this.page.route(`**/api/generate-classroom/${jobId}`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          resultUrl
            ? { success: true, status: 'succeeded', progress: 100, result: { url: resultUrl } }
            : { success: true, status: 'running', progress: 42 },
        ),
      });
    });
    return {
      getSubmittedBody: () => submittedBody,
      getPlanRequestBody: () => planRequestBody,
    };
  }

  /** Mock POST /api/video-capsules — creation succeeds, returns a queued capsule id */
  async mockVideoCapsuleCreate(id = 'e2e-capsule-1') {
    await this.page.route('**/api/video-capsules', (route) => {
      route.fulfill({
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, id, status: 'queued' }),
      });
    });
  }

  /** Mock POST /api/video-capsules — creation forbidden (feature flag disabled) */
  async mockVideoCapsuleCreateForbidden() {
    await this.page.route('**/api/video-capsules', (route) => {
      route.fulfill({
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'La génération de capsules vidéo est désactivée',
        }),
      });
    });
  }

  /** Mock GET /api/video-capsules/:id — exposes one generating poll before the playable result. */
  async mockVideoCapsuleStatusGeneratingThenDone(id = 'e2e-capsule-1') {
    let pollCount = 0;
    await this.page.route(`**/api/video-capsules/${id}`, (route) => {
      pollCount += 1;
      const done = pollCount > 1;
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          id,
          status: done ? 'done' : 'generating',
          variants: done
            ? [
                {
                  lang: 'fr',
                  format: 'mp4',
                  gatePassed: true,
                  url: `https://example.com/${id}.mp4`,
                },
              ]
            : [],
          error: null,
          done,
          pollIntervalMs: 5000,
        }),
      });
    });
  }

  /** Mock the persistent MP4 export job through creation and immediate completion. */
  async mockMp4ExportDone(id = 'e2e-mp4-export') {
    // Server exports are intentionally gated by an explicit persistence write:
    // the rendered job must consume the current editor state, never a stale
    // autosave. This mock acknowledges that write while keeping the fixture
    // independent from a real Supabase instance.
    await this.page.route('**/api/classroom', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      });
    });
    await this.page.route('**/api/export-snapshots/**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      });
    });
    await this.page.route('**/api/export-jobs', async (route) => {
      await route.fulfill({
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, id, status: 'queued' }),
      });
    });
    await this.page.route(`**/api/export-jobs/${id}`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          id,
          format: 'mp4',
          status: 'done',
          done: true,
          downloadUrl: `https://example.com/${id}.mp4`,
        }),
      });
    });
    await this.page.route(`https://example.com/${id}.mp4`, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${id}.mp4"`,
        },
        body: 'MP4',
      }),
    );
  }

  /**
   * Mock GET/PATCH /api/profile — rich profile section (culture, langue
   * d'interface, préférences — S2-001). Stateful: PATCH updates the values
   * a subsequent GET (or the PATCH response itself) would return, so a test
   * can save then re-read without a page reload.
   */
  async mockRichProfile(
    initial: { culture: string; uiLanguage: string; preferences: Record<string, unknown> } = {
      culture: 'ma-fr',
      uiLanguage: 'fr-FR',
      preferences: {},
    },
  ) {
    let state = { ...initial };
    await this.page.route('**/api/profile', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, richProfileEnabled: true, ...state }),
        });
        return;
      }
      if (method === 'PATCH') {
        const patch = route.request().postDataJSON() as Partial<typeof state>;
        state = { ...state, ...patch };
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, richProfileEnabled: true, ...state }),
        });
        return;
      }
      await route.continue();
    });
  }

  /** Mock GET /api/profile — feature flag `rich_profile` disabled, section stays hidden */
  async mockRichProfileDisabled() {
    await this.page.route('**/api/profile', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, richProfileEnabled: false }),
      });
    });
  }

  /** Set up API mocks for the generation flow. Note: server-providers is already mocked by the base fixture. */
  async setupGenerationMocks(stageId?: string) {
    await this.page.route('**/api/classroom?*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Local E2E classroom' }),
        });
        return;
      }
      await route.continue();
    });
    await this.mockSceneOutlinesStream();
    await this.mockSceneContent();
    await this.mockSceneActions(stageId);
  }
}
