import { test, expect } from '../fixtures/base';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { defaultTheme } from '../fixtures/test-data/scene-content';

const TEST_STAGE_ID = 'e2e-video-capsule-stage';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

/** Seed IndexedDB with a stage + a single scene, mirroring classroom-interaction.spec.ts */
async function seedDatabase(page: import('@playwright/test').Page) {
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
    localStorage.setItem('locale', 'en-US');
  }, SETTINGS_STORAGE);

  await page.goto('/app', { waitUntil: 'networkidle' });

  const seedStageData = () =>
    page.evaluate(
      ({ stageId, theme }) => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('MAIC-Database');

          request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
            const now = Date.now();

            tx.objectStore('stages').put({
              id: stageId,
              name: 'Photosynthesis',
              description: '',
              language: 'en-US',
              style: 'professional',
              createdAt: now,
              updatedAt: now,
            });

            tx.objectStore('scenes').put({
              id: 'scene-0',
              stageId,
              type: 'slide',
              title: 'Basic Concepts',
              order: 0,
              content: {
                type: 'slide',
                canvas: {
                  id: 'slide-0',
                  viewportSize: 1000,
                  viewportRatio: 0.5625,
                  theme,
                  elements: [
                    {
                      type: 'text',
                      id: 'el-0',
                      content: 'Basic Concepts',
                      left: 50,
                      top: 50,
                      width: 900,
                      height: 100,
                    },
                  ],
                },
              },
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
        });
      },
      { stageId: TEST_STAGE_ID, theme: defaultTheme },
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await seedStageData();
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Execution context was destroyed') || attempt === 2) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}

test.describe('Video capsule generation', () => {
  test.beforeEach(async ({ browserConsoleContract, page }) => {
    browserConsoleContract.expectHttpError('/api/classroom', 404);
    await seedDatabase(page);
  });

  test('generates a video capsule and plays the resulting mp4', async ({ page, mockApi }) => {
    await mockApi.mockVideoCapsuleCreate('e2e-capsule-1');
    await mockApi.mockVideoCapsuleStatusGeneratingThenDone('e2e-capsule-1');

    const classroom = new ClassroomPage(page);
    await classroom.goto(TEST_STAGE_ID);
    await classroom.waitForLoaded();

    await expect(classroom.sidebarScenes).toHaveCount(1, { timeout: 10_000 });

    await classroom.sidebarScenes.first().hover();
    await page.getByTestId('video-capsule-button').click();

    const modal = page.getByRole('heading', { name: 'Create a video capsule' });
    await expect(modal).toBeVisible();

    await page.getByRole('button', { name: 'Generate video' }).click();

    // Busy state: the first status poll remains in progress before completion.
    await expect(page.getByText('Building the video…')).toBeVisible();

    // Done state: the mp4 variant is rendered as a playable <video>
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 10_000 });
    await expect(video).toHaveAttribute('src', 'https://example.com/e2e-capsule-1.mp4');
  });

  test('shows an error message when the feature flag is disabled', async ({
    browserConsoleContract,
    page,
    mockApi,
  }) => {
    browserConsoleContract.expectHttpError('/api/video-capsules', 403);
    await mockApi.mockVideoCapsuleCreateForbidden();

    const classroom = new ClassroomPage(page);
    await classroom.goto(TEST_STAGE_ID);
    await classroom.waitForLoaded();

    await classroom.sidebarScenes.first().hover();
    await page.getByTestId('video-capsule-button').click();

    await expect(page.getByRole('heading', { name: 'Create a video capsule' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate video' }).click();

    await expect(page.getByText('La génération de capsules vidéo est désactivée')).toBeVisible();
  });
});
