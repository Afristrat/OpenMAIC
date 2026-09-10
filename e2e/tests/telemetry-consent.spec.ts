import { test, expect } from '../fixtures/base';

for (const locale of ['fr-FR', 'ar-MA', 'en-US']) {
  test(`consent, persisted refusal and withdrawal — ${locale}`, async ({ page, mockApi }) => {
    await mockApi.mockRichProfileDisabled();
    let choice: boolean | null = null;
    let xapiChoice = false;
    const xapiWrites: unknown[] = [];
    const writes: unknown[] = [];
    await page.addInitScript((value) => {
      localStorage.setItem('locale', value);
      localStorage.setItem('qalem-telemetry-dismissed', 'true');
      localStorage.setItem(
        'qalem-learning-outbox:v1:00000000-0000-4000-8000-000000000001:proof',
        '{}',
      );
      localStorage.setItem(
        'qalem-learning-outbox:v1:00000000-0000-4000-8000-000000000002:proof',
        '{}',
      );
    }, locale);
    await page.route('**/api/telemetry-consent*', async (route) => {
      const xapi =
        new URL(route.request().url()).searchParams.get('purpose') === 'xapi' ||
        (route.request().method() === 'POST' && route.request().postDataJSON().purpose === 'xapi');
      if (xapi) {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          xapiWrites.push(body);
          xapiChoice = body.consent;
        }
        await route.fulfill({ json: { choice: xapiChoice, ok: true } });
        return;
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        writes.push(body);
        choice = body.consent;
      }
      await route.fulfill({ json: { choice, hasConsent: choice === true, ok: true } });
    });
    await page.goto('/app');
    const control = page.getByRole('region').filter({
      has: page.getByRole('button', {
        name:
          locale === 'fr-FR'
            ? 'Autoriser les analyses'
            : locale === 'ar-MA'
              ? 'السماح بالتحليلات'
              : 'Allow analytics',
        exact: true,
      }),
    });
    await expect(control).toBeVisible();
    expect(writes).toEqual([]);
    await control.getByRole('button').nth(1).click();
    await expect(control).not.toBeVisible();
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
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/server-providers')),
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/telemetry-consent') &&
          response.request().method() === 'GET',
      ),
      page.reload(),
    ]);
    await expect(control).not.toBeVisible();
    await page.goto('/profile');
    await expect(control).toBeVisible();
    await control.getByRole('button').nth(0).click();
    await expect(control.getByRole('status')).toBeVisible();
    await control.getByRole('button').nth(1).click();
    await expect.poll(() => choice).toBe(false);
    expect(writes).toEqual([{ consent: false }, { consent: true }, { consent: false }]);
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
    expect(choice).toBe(false);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
  });
}

test('failed save stays visible and can be retried', async ({ page, browserConsoleContract }) => {
  browserConsoleContract.expectHttpError('/api/telemetry-consent', 503);
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  let fail = true;
  await page.route('**/api/telemetry-consent', (route) =>
    route.fulfill({
      status: route.request().method() === 'POST' && fail ? 503 : 200,
      json: { choice: route.request().method() === 'POST' ? false : null, ok: true },
    }),
  );
  await page.goto('/app');
  const control = page.getByRole('region', { name: 'Analyses d’apprentissage' });
  await control.getByRole('button', { name: 'Refuser', exact: true }).click();
  await expect(control.getByRole('alert')).toBeVisible();
  fail = false;
  await control.getByRole('button', { name: 'Refuser', exact: true }).click();
  await expect(control).not.toBeVisible();
});
