import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { buildPcm16Wav } from '../../tests/audio/pcm16-wav-fixture';

const STAGE_ID = 'e2e-authoritative-audio';

test('privilégie la classroom serveur et sa narration sur le cache local périmé', async ({
  page,
}) => {
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
  }, createSettingsStorage());
  await page.goto('/app', { waitUntil: 'networkidle' });
  await page.evaluate(
    (stageId) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('MAIC-Database');
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
          const now = Date.now();
          tx.objectStore('stages').put({
            id: stageId,
            name: 'Cache périmé',
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('scenes').put({
            id: 'cached-scene',
            stageId,
            type: 'slide',
            title: 'Version sans narration',
            order: 1,
            content: { type: 'slide', canvas: { id: 'cached-slide', elements: [] } },
            actions: [],
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('scenes').put({
            id: 'quiz-scene',
            stageId,
            type: 'quiz',
            title: 'Quiz depuis le cache',
            order: 2,
            content: {
              type: 'quiz',
              questions: [
                {
                  id: 'cached-question',
                  type: 'single',
                  question: 'Quelle scène doit rester sélectionnée ?',
                  options: [
                    { label: 'La première', value: 'A' },
                    { label: 'Le quiz', value: 'B' },
                  ],
                  answer: ['B'],
                  analysis: 'Le rafraîchissement ne doit pas déplacer la lecture.',
                  hasAnswer: true,
                  points: 1,
                },
              ],
            },
            actions: [],
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('stageOutlines').put({
            stageId,
            outlines: [],
            createdAt: now,
            updatedAt: now,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    STAGE_ID,
  );

  let releaseServerRefresh!: () => void;
  let markServerRefreshStarted!: () => void;
  const serverRefreshReleased = new Promise<void>((resolve) => {
    releaseServerRefresh = resolve;
  });
  const serverRefreshStarted = new Promise<void>((resolve) => {
    markServerRefreshStarted = resolve;
  });
  await page.route(`**/api/classroom?id=${STAGE_ID}`, async (route) => {
    markServerRefreshStarted();
    await serverRefreshReleased;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        classroom: {
          stage: {
            id: STAGE_ID,
            name: 'Version serveur',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          scenes: [
            {
              id: 'server-scene',
              stageId: STAGE_ID,
              type: 'slide',
              title: 'Narration serveur disponible',
              order: 1,
              content: { type: 'slide', canvas: { id: 'server-slide', elements: [] } },
              actions: [
                {
                  id: 'server-speech',
                  type: 'speech',
                  text: 'Cette narration provient de la classroom persistée.',
                  audioUrl: `/api/classroom-media/${STAGE_ID}/audio/server-speech.wav`,
                },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'quiz-scene',
              stageId: STAGE_ID,
              type: 'quiz',
              title: 'Quiz depuis le serveur',
              order: 2,
              content: {
                type: 'quiz',
                questions: [
                  {
                    id: 'server-question',
                    type: 'single',
                    question: 'Quelle scène doit rester sélectionnée ?',
                    options: [
                      { label: 'La première', value: 'A' },
                      { label: 'Le quiz', value: 'B' },
                    ],
                    answer: ['B'],
                    analysis: 'Le rafraîchissement ne doit pas déplacer la lecture.',
                    hasAnswer: true,
                    points: 1,
                  },
                ],
              },
              actions: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      }),
    });
  });
  await page.route(`**/api/classroom-media/${STAGE_ID}/audio/server-speech.wav`, (route) =>
    route.fulfill({
      contentType: 'audio/wav',
      body: Buffer.from(buildPcm16Wav(new Array(12_000).fill(0))),
    }),
  );

  await page.goto(`/classroom/${STAGE_ID}`);
  await serverRefreshStarted;
  await expect(page.getByTestId('scene-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.getByTestId('scene-item').nth(1)).toBeVisible();
  await page.getByTestId('scene-item').nth(1).click();
  await expect(page.getByRole('button', { name: 'Start Quiz' })).toBeVisible();
  releaseServerRefresh();

  const serverSceneItems = page.getByTestId('scene-item');
  await expect(serverSceneItems.first()).toContainText('Narration serveur disponible');
  await expect(serverSceneItems.first()).not.toContainText('Version sans narration');
  await expect(serverSceneItems.nth(1)).toContainText('Quiz depuis le serveur');
  await expect(page.getByRole('button', { name: 'Start Quiz' })).toBeVisible();

  await serverSceneItems.first().click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('[data-scene-completion-gate="true"]')).toBeVisible({
    timeout: 10_000,
  });
});
