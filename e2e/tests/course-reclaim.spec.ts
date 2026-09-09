import { expect, test } from '../fixtures/base';
const id = '00000000-0036-4000-8000-000000000149';
const labels = [
  { locale: 'fr-FR', button: 'Reprendre la responsabilité', done: 'Responsabilité reprise.' },
  { locale: 'ar-MA', button: 'تولّي المسؤولية', done: 'تمّ تولّي المسؤولية.' },
  { locale: 'en-US', button: 'Take ownership', done: 'Ownership confirmed.' },
];
for (const { locale, button, done } of labels) {
  test(`reclaims a draft without generating or publishing: ${locale}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
    await page.route('**/api/courses/catalog?*', (route) =>
      route.fulfill({ json: { courses: [] } }),
    );
    await page.route('**/api/courses/orphaned?*', (route) =>
      route.fulfill({
        json: {
          courses: [
            { id, title: 'Unowned draft', status: 'draft', stage_id: null, language: 'fr-FR' },
          ],
          nextCursor: null,
        },
      }),
    );
    let mutations = 0;
    await page.route(`**/api/courses/${id}/reclaim`, async (route) => {
      mutations++;
      expect(route.request().method()).toBe('POST');
      expect(route.request().postData()).toBeNull();
      await route.fulfill({ json: { courseId: id, sourceManifestId: null } });
    });
    const unrelated: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/publication') || request.url().includes('/api/generate/'))
        unrelated.push(request.url());
    });
    await page.goto('/catalog');
    await expect(page.getByText('Unowned draft')).toBeVisible();
    if (locale === 'ar-MA') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: done })).toBeVisible();
    await expect(page.getByRole('button', { name: button, exact: true })).toHaveCount(0);
    expect(mutations).toBe(1);
    expect(unrelated).toEqual([]);
  });
}
test('shows an unconfirmed takeover without removing the draft', async ({
  page,
  browserConsoleContract,
}) => {
  browserConsoleContract.expectHttpError(`/api/courses/${id}/reclaim`, 503);
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await page.route('**/api/courses/catalog?*', (route) => route.fulfill({ json: { courses: [] } }));
  await page.route('**/api/courses/orphaned?*', (route) =>
    route.fulfill({
      json: {
        courses: [
          { id, title: 'Draft retained', status: 'draft', language: 'fr-FR', stage_id: null },
        ],
        nextCursor: null,
      },
    }),
  );
  await page.route(`**/api/courses/${id}/reclaim`, (route) =>
    route.fulfill({ status: 503, json: { error: 'Unconfirmed' } }),
  );
  await page.goto('/catalog');
  await page.getByRole('button', { name: 'Reprendre la responsabilité', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Formations sans responsable' }).getByRole('alert'),
  ).toContainText('L’opération n’a pas pu être confirmée');
  await expect(page.getByText('Draft retained')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reprendre la responsabilité', exact: true }),
  ).toBeEnabled();
});
