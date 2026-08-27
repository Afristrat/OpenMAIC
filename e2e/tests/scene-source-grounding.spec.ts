import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const STAGE_ID = 'e2e-source-grounding';

test('shows the active scene source version and exact passage to the author', async ({ page }) => {
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
    localStorage.setItem('locale', 'en-US');
  }, createSettingsStorage());

  await page.route(`**/api/classroom?id=${STAGE_ID}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        canEdit: true,
        canViewSources: true,
        classroom: {
          stage: {
            id: STAGE_ID,
            name: 'Grounded classroom',
            researchSources: [{ kind: 'uploaded', title: 'operations-guide.pdf' }],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          scenes: [
            {
              id: 'grounded-scene',
              stageId: STAGE_ID,
              type: 'slide',
              title: 'Contribution margin',
              order: 0,
              content: { type: 'slide', canvas: { id: 'grounded-slide', elements: [] } },
              actions: [],
              sourceGrounding: {
                schemaVersion: 1,
                status: 'grounded',
                issues: [],
                passages: [
                  {
                    id: 'operations-guide:v1-proof:p2',
                    sourceId: 'operations-guide',
                    sourceVersion: 'v1-proof',
                    sourceTitle: 'operations-guide.pdf',
                    text: 'The pilot store contribution margin target is exactly 37.5%.',
                    start: 120,
                    end: 182,
                  },
                ],
              },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      }),
    }),
  );

  await page.goto(`/classroom/${STAGE_ID}`);
  await page.getByRole('button', { name: 'Sources' }).click();

  const grounding = page.getByTestId('scene-source-grounding');
  await expect(grounding).toContainText('Active scene grounding');
  await expect(grounding).toContainText('operations-guide:v1-proof:p2');
  await expect(grounding).toContainText('37.5%');
});
