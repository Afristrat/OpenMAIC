import type { Page } from '@playwright/test';
import { mockOutlines } from './test-data/scene-outlines';
import { mockSceneContentResponse } from './test-data/scene-content';
import { createMockSceneActionsResponse } from './test-data/scene-actions';

/**
 * Wraps Playwright's page.route() to mock OpenMAIC API endpoints.
 * Supports both JSON and SSE (text/event-stream) responses.
 */
export class MockApi {
  constructor(private page: Page) {}

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
      if (!stageId) {
        try {
          const body = route.request().postDataJSON();
          if (body?.stageId) id = body.stageId;
        } catch {
          // fallback to default
        }
      }
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createMockSceneActionsResponse(id)),
      });
    });
  }

  /** Mock the server providers endpoint (returns empty — client-side config only) */
  async mockServerProviders() {
    await this.page.route('**/api/server-providers', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: {} }),
      });
    });
  }

  /** Mock the persistent classroom-generation handoff used by the home page. */
  async mockClassroomGenerationJob(jobId = 'e2e-generation-job', resultUrl?: string) {
    let submittedBody: unknown;
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
    return { getSubmittedBody: () => submittedBody };
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
