import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { defaultTheme } from '../fixtures/test-data/scene-content';

const STAGE_ID = 'public-discussion-access-e2e';

test('requires an invited account before a public classroom can start', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(
    (settings) => {
      localStorage.setItem('locale', 'en-US');
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('qalem-current-org-id', 'cached-other-organization');
    },
    createSettingsStorage({ sidebarCollapsed: false }),
  );

  await page.goto('/app', { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ stageId, theme }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('MAIC-Database');
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
          const now = Date.now();
          tx.objectStore('stages').put({
            id: stageId,
            name: 'Cached public course',
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('scenes').put({
            id: 'cached-discussion-scene',
            stageId,
            type: 'slide',
            title: 'Cached public lesson',
            order: 0,
            content: {
              type: 'slide',
              canvas: { id: 'cached-discussion-canvas', theme, elements: [] },
            },
            actions: [
              {
                id: 'cached-public-discussion',
                type: 'discussion',
                topic: 'A cached protected discussion',
              },
            ],
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
    { stageId: STAGE_ID, theme: defaultTheme },
  );

  let releaseAccessCheck!: () => void;
  let markAccessCheckStarted!: () => void;
  const accessCheckReleased = new Promise<void>((resolve) => {
    releaseAccessCheck = resolve;
  });
  const accessCheckStarted = new Promise<void>((resolve) => {
    markAccessCheckStarted = resolve;
  });

  await page.route(`**/api/classroom?id=${STAGE_ID}`, async (route) => {
    markAccessCheckStarted();
    await accessCheckReleased;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        canEdit: false,
        canViewSources: false,
        canInteract: false,
        classroom: {
          id: STAGE_ID,
          generationComplete: true,
          stage: {
            id: STAGE_ID,
            name: 'Public discussion course',
            language: 'en-US',
            style: 'professional',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          scenes: [
            {
              id: 'discussion-scene',
              stageId: STAGE_ID,
              type: 'slide',
              title: 'Public lesson',
              order: 0,
              content: {
                type: 'slide',
                canvas: { id: 'discussion-canvas', theme: defaultTheme, elements: [] },
              },
              actions: [
                {
                  id: 'public-discussion',
                  type: 'discussion',
                  topic: 'A protected discussion',
                },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      }),
    });
  });

  let chatRequests = 0;
  await page.route('**/api/chat', (route) => {
    chatRequests += 1;
    return route.abort();
  });

  await page.goto(`/classroom/${STAGE_ID}`);
  await accessCheckStarted;
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeHidden();
  await expect.poll(() => chatRequests).toBe(0);

  releaseAccessCheck();
  await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Sign in before you begin' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    `/auth?next=%2Fclassroom%2F${STAGE_ID}`,
  );
  await expect.poll(() => chatRequests).toBe(0);
});

test('lets an authorized learner seek through scenes and shows the persisted female teacher', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(
    (settings) => {
      localStorage.setItem('locale', 'en-US');
      localStorage.setItem('settings-storage', settings);
    },
    createSettingsStorage({ sidebarCollapsed: false }),
  );

  const scene = (id: string, title: string, order: number) => ({
    id,
    stageId: STAGE_ID,
    type: 'slide',
    title,
    order,
    content: {
      type: 'slide',
      canvas: { id: `${id}-canvas`, theme: defaultTheme, elements: [] },
    },
    actions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await page.route(`**/api/classroom?id=${STAGE_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        canEdit: false,
        canViewSources: false,
        canInteract: true,
        interactionOrganizationId: 'authorized-organization',
        classroom: {
          id: STAGE_ID,
          generationComplete: true,
          stage: {
            id: STAGE_ID,
            name: 'Seekable course',
            language: 'en-US',
            style: 'professional',
            teacherProfile: {
              name: 'Hanae',
              avatar: '/avatars/teacher-2.png',
              providerId: 'higgs-tts',
              voiceId: 'hanae',
            },
            generatedAgentConfigs: [
              {
                id: 'persona-professor',
                name: 'Hanae',
                role: 'teacher',
                persona: 'Lead teacher',
                avatar: '/avatars/teacher-2.png',
                color: '#3b82f6',
                priority: 10,
                interactionWeight: 100,
                gender: 'female',
                voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
              },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          scenes: [
            scene('first-scene', 'First lesson', 0),
            scene('second-scene', 'Second lesson', 1),
          ],
        },
      }),
    }),
  );

  await page.goto(`/classroom/${STAGE_ID}`);
  await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 15_000 });

  const progress = page.getByRole('slider', { name: 'Course progress' });
  await expect(progress).toBeVisible();
  await progress.fill('1');
  await expect(page.getByText('Second lesson', { exact: true }).first()).toBeVisible();
  await expect(page.locator('img[src="/avatars/teacher-2.png"]').first()).toBeVisible();
});
