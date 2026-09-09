import { test, expect } from '../fixtures/base';

for (const [locale, label] of [
  ['fr-FR', 'Supprimer le compte'],
  ['ar-MA', 'حذف الحساب'],
  ['en-US', 'Delete account'],
] as const) {
  test(`account deletion requires server confirmation — ${locale}`, async ({
    page,
    mockApi,
    browserConsoleContract,
  }) => {
    await mockApi.mockRichProfileDisabled();
    browserConsoleContract.expectHttpError('/api/account/delete', 503);
    await page.addInitScript((value) => {
      localStorage.setItem('locale', value);
      localStorage.setItem(
        'qalem-learning-outbox:v1:00000000-0000-4000-8000-000000000001:proof',
        '{}',
      );
      localStorage.setItem(
        'qalem-learning-outbox:v1:00000000-0000-4000-8000-000000000002:proof',
        '{}',
      );
    }, locale);
    let calls = 0;
    let confirmed = false;
    await page.route('**/api/account/delete', async (route) => {
      expect(route.request().method()).toBe('DELETE');
      expect(route.request().postData()).toBeNull();
      calls++;
      await route.fulfill({
        status: confirmed ? 200 : 503,
        json: confirmed ? { success: true, accountDeleted: true } : { error: 'unconfirmed' },
      });
    });
    await page.goto('/profile');
    await page.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    expect(calls).toBe(0);
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
    expect(calls).toBe(1);
    expect(
      await page.evaluate(() =>
        localStorage.getItem('qalem-learning-outbox:v1:00000000-0000-4000-8000-000000000001:proof'),
      ),
    ).toBe('{}');
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
    confirmed = true;
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(/\/auth$/);
    expect(calls).toBe(2);
    expect(
      await page.evaluate(() =>
        localStorage.getItem('qalem-learning-outbox:v1:00000000-0000-4000-8000-000000000001:proof'),
      ),
    ).toBeNull();
    expect(
      await page.evaluate(() =>
        localStorage.getItem('qalem-learning-outbox:v1:00000000-0000-4000-8000-000000000002:proof'),
      ),
    ).toBe('{}');
  });
}

test('a successful HTTP response without the deletion acknowledgement is not success', async ({
  page,
  mockApi,
}) => {
  await mockApi.mockRichProfileDisabled();
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await page.route('**/api/account/delete', (route) => route.fulfill({ json: { success: true } }));
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Supprimer le compte', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Supprimer le compte', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/profile$/);
});
