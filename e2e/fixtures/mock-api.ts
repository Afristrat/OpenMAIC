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

  /** Mock GET /api/video-capsules/:id — resolves immediately as done, with a playable mp4 variant */
  async mockVideoCapsuleStatusDone(id = 'e2e-capsule-1') {
    await this.page.route(`**/api/video-capsules/${id}`, (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          id,
          status: 'done',
          variants: [
            { lang: 'fr', format: 'mp4', gatePassed: true, url: `https://example.com/${id}.mp4` },
          ],
          error: null,
          done: true,
          pollIntervalMs: 5000,
        }),
      });
    });
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
    await this.mockSceneOutlinesStream();
    await this.mockSceneContent();
    await this.mockSceneActions(stageId);
  }
}
