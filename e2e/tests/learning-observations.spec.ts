import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { buildPcm16Wav } from '../../tests/audio/pcm16-wav-fixture';
import { MockApi } from '../fixtures/mock-api';

const stageId = 'learning-observation-classroom';
const epoch = '00000000-0000-4000-8000-000000000021';

for (const scenario of [
  'refused',
  'allowed',
  'retry',
  'revoked',
  'skipped',
  'closed',
  'closed-revoked',
]) {
  test(`classroom collection: ${scenario}`, async ({
    page: initialPage,
    context,
    browserConsoleContract,
  }) => {
    let page = initialPage;
    await page.unroute('**/api/telemetry-consent');
    const allowed = scenario !== 'refused';
    const failedFirst =
      scenario === 'retry' || scenario === 'revoked' || scenario.startsWith('closed');
    let currentEpoch = epoch;
    if (failedFirst) browserConsoleContract.expectHttpError('/api/learning-observations', 503);
    const observations: Record<string, unknown>[] = [];
    await context.addInitScript(
      (settings) => {
        localStorage.setItem('locale', 'en-US');
        localStorage.setItem('settings-storage', settings);
      },
      createSettingsStorage({ sidebarCollapsed: false }),
    );
    await context.route('**/api/telemetry-consent', (route) =>
      route.fulfill({
        json: { choice: allowed, hasConsent: allowed, epoch: currentEpoch },
      }),
    );
    await context.route('**/api/learning-observations', (route) => {
      observations.push(route.request().postDataJSON());
      return route.fulfill({
        status: failedFirst && observations.length === 1 ? 503 : 200,
        json: { recorded: true },
      });
    });
    await context.route('**/api/classroom?*', (route) =>
      route.fulfill({
        json: {
          success: true,
          canEdit: false,
          canViewSources: false,
          classroom: {
            id: stageId,
            url: `/classroom/${stageId}`,
            generationComplete: true,
            stage: {
              id: stageId,
              name: 'Observation proof',
              language: 'en-US',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            scenes: [
              {
                id: 'observed-slide',
                stageId,
                type: 'slide',
                title: 'Observed slide',
                order: 0,
                content: { type: 'slide', canvas: { id: 'observed-canvas', elements: [] } },
                actions: [
                  {
                    id: 'observed-speech',
                    type: 'speech',
                    text: 'Listen to this scene.',
                    audioUrl: `/api/classroom-media/${stageId}/audio/proof.wav`,
                  },
                ],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ],
          },
        },
      }),
    );
    await context.route('**/audio/proof.wav', (route) =>
      route.fulfill({
        contentType: 'audio/wav',
        body: Buffer.from(buildPcm16Wav(new Array(12000).fill(0))),
      }),
    );
    await page.goto(`/classroom/${stageId}`, { waitUntil: 'networkidle' });
    if (scenario === 'skipped') {
      await page.getByText('Course complete', { exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      const gate = page.locator('[data-scene-completion-gate="true"]');
      await expect(gate).toBeVisible({ timeout: 10000 });
      await gate.getByRole('button').last().click();
    }
    await expect(page.getByRole('region', { name: 'Course complete' })).toBeVisible();
    if (allowed) {
      await expect.poll(() => observations.length).toBe(1);
      expect(observations[0]).toMatchObject({
        stageId,
        consentEpoch: epoch,
        sceneSequence: ['slide'],
        completionRate: scenario === 'skipped' ? 0 : 1,
        quizScores: [],
        language: null,
        level: null,
        actionCounts: {
          play: scenario === 'skipped' ? 0 : 1,
          pause: 0,
          seek: scenario === 'skipped' ? 1 : 0,
        },
      });
      expect(observations[0]).not.toHaveProperty('userId');
      if (failedFirst) {
        const retry = page.getByRole('button', { name: 'Retry', exact: true });
        await expect(retry).toBeVisible();
        if (scenario.startsWith('closed')) {
          expect(
            await page.evaluate(
              () =>
                Object.keys(localStorage).filter((key) =>
                  key.startsWith('qalem-learning-outbox:v1:'),
                ).length,
            ),
          ).toBe(1);
          await page.close();
          if (scenario === 'closed-revoked') currentEpoch = '00000000-0000-4000-8000-000000000022';
          page = await context.newPage();
          const reopenedErrors: string[] = [];
          page.on('pageerror', (error) => reopenedErrors.push(error.message));
          page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning')
              reopenedErrors.push(message.text());
          });
          const reopenedApi = new MockApi(page);
          await reopenedApi.mockServerProviders();
          await reopenedApi.mockSourceLibrary();
          await page.route('**/api/lti/context?*', (route) =>
            route.fulfill({ json: { success: true, active: false } }),
          );
          for (const capability of ['live-sessions', 'anchoring']) {
            await page.route(`**/api/${capability}/capability`, (route) =>
              route.fulfill({ json: { success: true, enabled: false } }),
            );
          }
          await page.goto(`/classroom/${stageId}`, { waitUntil: 'networkidle' });
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  Object.keys(localStorage).filter((key) =>
                    key.startsWith('qalem-learning-outbox:v1:'),
                  ).length,
              ),
            )
            .toBe(0);
          expect(observations.length).toBe(scenario === 'closed' ? 2 : 1);
          if (scenario === 'closed') expect(observations[1]).toEqual(observations[0]);
          expect(reopenedErrors).toEqual([]);
          return;
        }
        if (scenario === 'revoked') currentEpoch = '00000000-0000-4000-8000-000000000022';
        await retry.click();
        await expect(retry).not.toBeVisible();
        expect(observations.length).toBe(scenario === 'retry' ? 2 : 1);
        if (scenario === 'retry') expect(observations[1]).toEqual(observations[0]);
      }
    } else {
      await page.waitForLoadState('networkidle');
      expect(observations).toEqual([]);
    }
  });
}
