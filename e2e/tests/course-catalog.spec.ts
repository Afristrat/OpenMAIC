import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const ORG_ID = '00000000-0000-4000-8000-000000000002';
const CLASSROOM_ID = 'e2e-catalog-classroom';

test.describe('Catalogue de formations', () => {
  test('affiche la formation publiée de l’organisation et rejoint sa classroom', async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'fr-FR');
    }, createSettingsStorage());

    await page.route(`**/api/courses/catalog?orgId=${ORG_ID}`, (route) =>
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
        }),
      }),
    );

    await page.goto('/catalog');

    await expect(page.getByRole('heading', { name: 'Catalogue de formations' })).toBeVisible();
    await expect(page.getByText('Piloter une décision complexe')).toBeVisible();
    await page.getByRole('link', { name: 'Rejoindre la classe' }).click();
    await expect(page).toHaveURL(new RegExp(`/classroom/${CLASSROOM_ID}$`));
  });

  test('préserve une mise en page RTL en arabe', async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'ar-MA');
    }, createSettingsStorage());
    await page.route(`**/api/courses/catalog?orgId=${ORG_ID}`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, courses: [] }) }),
    );

    await page.goto('/catalog');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'دليل التكوينات' })).toBeVisible();
  });
});
