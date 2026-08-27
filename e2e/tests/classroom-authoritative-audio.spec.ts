import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const STAGE_ID = 'e2e-authoritative-audio';

test('privilégie la classroom serveur et sa narration sur le cache local périmé', async ({
  page,
}) => {
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
  }, createSettingsStorage());
  await page.goto('/app');
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

  await page.route(`**/api/classroom?id=${STAGE_ID}`, (route) =>
    route.fulfill({
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
          ],
        },
      }),
    }),
  );

  await page.goto(`/classroom/${STAGE_ID}`);

  await expect(page.getByTestId('scene-item')).toContainText('Narration serveur disponible');
  await expect(page.getByTestId('scene-item')).not.toContainText('Version sans narration');
});
