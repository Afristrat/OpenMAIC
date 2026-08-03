import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const ORG_ID = '00000000-0000-4000-8000-000000000002';
const CLASSROOM_ID = 'e2e-catalog-classroom';
const PUBLISHED_CLASSROOM_ID = 'e2e-unpublished-classroom';

test.describe('Catalogue de formations', () => {
  test('affiche la formation publiée de l’organisation et rejoint sa classroom', async ({
    page,
  }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'fr-FR');
    }, createSettingsStorage());

    await page.route(/\/api\/courses\/catalog\?/, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          courses: [
            {
              id: '00000000-0000-4000-8000-000000000018',
              title: 'Piloter une décision complexe',
              language: 'fr-FR',
              classroomId: CLASSROOM_ID,
              createdAt: '2026-08-01T00:00:00.000Z',
            },
          ],
          unpublished: [
            {
              id: '00000000-0000-4000-8000-000000000019',
              title: 'Formation à publier',
              language: 'fr-FR',
              classroomId: PUBLISHED_CLASSROOM_ID,
              createdAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
      }),
    );
    await page.route('**/api/courses/00000000-0000-4000-8000-000000000019/publication', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: '{"success":true,"catalogVisible":true}',
      }),
    );
    await page.route('**/api/classroom?id=*', (route) => {
      const classroomId = new URL(route.request().url()).searchParams.get('id');
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          stage: {
            id: classroomId,
            name: 'Formation de démonstration',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          scenes: [],
        }),
      });
    });

    await page.goto('/catalog');

    await expect(page.getByRole('heading', { name: 'Catalogue de formations' })).toBeVisible();
    await expect(page.getByText('Piloter une décision complexe')).toBeVisible();
    await expect(page.getByText('Formation à publier')).toBeVisible();
    await page.getByRole('button', { name: 'Publier au catalogue' }).click();
    await expect(page.getByRole('button', { name: 'Publier au catalogue' })).toHaveCount(0);
    await page.locator(`a[href="/classroom/${PUBLISHED_CLASSROOM_ID}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/classroom/${PUBLISHED_CLASSROOM_ID}$`));
  });

  test('préserve une mise en page RTL en arabe', async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'ar-MA');
    }, createSettingsStorage());
    await page.route(/\/api\/courses\/catalog\?/, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, courses: [] }),
      }),
    );

    await page.goto('/catalog');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'دليل التكوينات' })).toBeVisible();
  });
});
