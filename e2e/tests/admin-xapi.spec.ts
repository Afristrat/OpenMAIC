import { expect, test } from '../fixtures/base';

for (const [locale, button, success, error] of [
  [
    'fr-FR',
    'Tester la connexion',
    'Connexion et version vérifiées ; droit d’écriture non testé.',
    'Statut indisponible. Rechargez la page pour réessayer.',
  ],
  [
    'ar-MA',
    'اختبار الاتصال',
    'تم التحقق من الاتصال والإصدار؛ لم تُختبر صلاحية الكتابة.',
    'الحالة غير متاحة. أعد تحميل الصفحة للمحاولة مجددًا.',
  ],
  [
    'en-US',
    'Test connection',
    'Connection and version verified; write access not tested.',
    'Status unavailable. Reload the page to retry.',
  ],
] as const) {
  test(`xAPI diagnostics distinguish configuration, success and failure — ${locale}`, async ({
    page,
    browserConsoleContract,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({ json: { isAdmin: true } }),
    );
    let configured = false;
    let failed = false;
    browserConsoleContract.expectHttpError('/api/xapi/status', 503);
    await page.route('**/api/xapi/status', (route) =>
      failed
        ? route.fulfill({ status: 503, json: { error: 'private diagnostic' } })
        : route.fulfill({ json: { configured, endpoint: null } }),
    );
    await page.route('**/api/xapi/test', (route) =>
      route.fulfill({ json: { success: true, connectionVerified: true, writeVerified: false } }),
    );
    await page.goto('/admin?tab=xapi');
    await expect(page.getByRole('button', { name: button, exact: true })).toBeDisabled();
    configured = true;
    await page.reload();
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByText(success, { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
    failed = true;
    await page.reload();
    await expect(page.locator('p[role="alert"]')).toHaveText(error);
    await expect(page.getByRole('button', { name: button, exact: true })).toBeDisabled();
    await expect(page.getByText('private diagnostic')).toHaveCount(0);
  });
}
