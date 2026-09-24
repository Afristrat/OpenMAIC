import { test, expect } from '../fixtures/base';

for (const locale of ['fr-FR', 'ar-MA', 'en-US']) {
  test(`contractual analytics and separate xAPI choice — ${locale}`, async ({ page, mockApi }) => {
    await mockApi.mockRichProfileDisabled();
    let xapiChoice = false;
    const xapiWrites: unknown[] = [];
    await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
    await page.route('**/api/telemetry-consent*', async (route) => {
      const request = route.request();
      const xapi =
        new URL(request.url()).searchParams.get('purpose') === 'xapi' ||
        (request.method() === 'POST' && request.postDataJSON().purpose === 'xapi');
      if (!xapi) {
        await route.fulfill({
          json: {
            choice: true,
            hasConsent: true,
            epoch: '00000000-0036-4000-8000-000000000099',
          },
        });
        return;
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        xapiWrites.push(body);
        xapiChoice = body.consent;
      }
      await route.fulfill({ json: { choice: xapiChoice, hasConsent: xapiChoice, ok: true } });
    });

    await page.goto('/profile');
    await expect(page.getByRole('region', { name: /Analyses|analytics|تحليلات/ })).toHaveCount(0);
    const xapi = page.getByRole('region', {
      name:
        locale === 'fr-FR' ? 'Partage xAPI' : locale === 'ar-MA' ? 'مشاركة xAPI' : 'xAPI sharing',
      exact: true,
    });
    await expect(xapi).toBeVisible();
    expect(xapiWrites).toEqual([]);
    await xapi.getByRole('button').nth(0).click();
    await expect.poll(() => xapiChoice).toBe(true);
    await xapi.getByRole('button').nth(1).click();
    await expect.poll(() => xapiChoice).toBe(false);
    expect(xapiWrites).toEqual([
      { consent: true, purpose: 'xapi' },
      { consent: false, purpose: 'xapi' },
    ]);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
  });
}

test('failed xAPI save stays visible and can be retried', async ({
  page,
  mockApi,
  browserConsoleContract,
}) => {
  await mockApi.mockRichProfileDisabled();
  browserConsoleContract.expectHttpError('/api/telemetry-consent', 503);
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  let fail = true;
  await page.route('**/api/telemetry-consent*', (route) =>
    route.fulfill({
      status: route.request().method() === 'POST' && fail ? 503 : 200,
      json: {
        choice: route.request().method() === 'POST' ? true : false,
        ok: route.request().method() !== 'POST' || !fail,
      },
    }),
  );
  await page.goto('/profile');
  const control = page.getByRole('region', { name: 'Partage xAPI' });
  await control.getByRole('button', { name: 'Autoriser le partage xAPI' }).click();
  await expect(control.getByRole('alert')).toBeVisible();
  fail = false;
  await control.getByRole('button', { name: 'Autoriser le partage xAPI' }).click();
  await expect(control.getByRole('status')).toBeVisible();
});
