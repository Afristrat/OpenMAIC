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
  'quiz-allowed',
  'quiz-refused',
]) {
  test(`classroom collection: ${scenario}`, async ({
    page: initialPage,
    context,
    browserConsoleContract,
    mockApi,
  }) => {
    let page = initialPage;
    await page.unroute('**/api/telemetry-consent');
    const allowed = !scenario.endsWith('refused');
    const withQuiz = scenario.startsWith('quiz-');
    const quizWrites: Record<string, unknown>[] = [];
    if (withQuiz) {
      await mockApi.mockQuizPersistence();
      await page.route('**/api/quiz-attempts', (route) => {
        const submitted = route.request().postDataJSON();
        expect(submitted).toMatchObject({
          stageId,
          sceneId: 'observed-quiz',
          orgId: '00000000-0000-4000-8000-000000000088',
          answers: { 'weighted-question': 'a', 'second-question': 'a' },
        });
        expect(submitted).not.toHaveProperty('score');
        expect(submitted).not.toHaveProperty('questions');
        return route.fulfill({
          json: {
            success: true,
            status: 'completed',
            attemptId: '00000000-0047-4000-8000-000000000088',
            score: 25,
            results: [
              { questionId: 'weighted-question', earned: 0, correct: false, status: 'incorrect' },
              { questionId: 'second-question', earned: 1, correct: true, status: 'correct' },
            ],
          },
        });
      });
      await page.route('**/rest/v1/quiz_results*', async (route) => {
        quizWrites.push(route.request().postDataJSON());
        await route.fallback();
      });
      await page.route('**/api/xapi/events', (route) => route.fulfill({ json: { success: true } }));
    }
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
          canInteract: true,
          interactionOrganizationId: '00000000-0000-4000-8000-000000000088',
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
              ...(withQuiz
                ? [
                    {
                      id: 'observed-quiz',
                      stageId,
                      type: 'quiz',
                      title: 'Observed quiz',
                      order: 1,
                      content: {
                        type: 'quiz',
                        questions: [
                          {
                            id: 'weighted-question',
                            type: 'single',
                            question: 'Capital of Morocco?',
                            options: [
                              { value: 'a', label: 'Casablanca' },
                              { value: 'b', label: 'Rabat' },
                            ],
                            answer: ['b'],
                            hasAnswer: true,
                            points: 3,
                          },
                          {
                            id: 'second-question',
                            type: 'single',
                            question: 'Two plus two?',
                            options: [
                              { value: 'a', label: 'Four' },
                              { value: 'b', label: 'Five' },
                            ],
                            answer: ['a'],
                            hasAnswer: true,
                            points: 1,
                          },
                        ],
                      },
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    },
                  ]
                : []),
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
    if (withQuiz) {
      await page.getByRole('button', { name: 'Start Quiz', exact: true }).click();
      await page.getByRole('button', { name: /Casablanca/ }).click();
      await page.getByRole('button', { name: /Four/ }).click();
      await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
      await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
      expect(quizWrites).toHaveLength(1);
      expect(quizWrites[0]).toMatchObject({
        org_id: '00000000-0000-4000-8000-000000000088',
        stage_id: stageId,
        scene_id: 'observed-quiz',
        score: 25,
      });
      expect(observations).toEqual([]);
      await page.getByText('Course complete', { exact: true }).click();
    }
    await expect(page.getByRole('region', { name: 'Course complete' })).toBeVisible();
    if (allowed) {
      await expect.poll(() => observations.length).toBe(1);
      expect(observations[0]).toMatchObject({
        stageId,
        consentEpoch: epoch,
        orgId: '00000000-0000-4000-8000-000000000088',
        sceneSequence: withQuiz ? ['slide', 'quiz'] : ['slide'],
        completionRate: scenario === 'skipped' ? 0 : 1,
        quizScores: withQuiz ? [0.25] : [],
        language: null,
        level: null,
        actionCounts: {
          play: scenario === 'skipped' ? 0 : 1,
          pause: 0,
          seek: scenario === 'skipped' || withQuiz ? 1 : 0,
        },
      });
      expect(observations[0]).not.toHaveProperty('userId');
      if (withQuiz)
        expect(observations[0].sceneObservations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'observed-quiz',
              type: 'quiz',
              completed: true,
              score: 0.25,
              attempts: [0.25],
            }),
          ]),
        );
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
