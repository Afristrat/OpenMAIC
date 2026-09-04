import { expect, test } from '../fixtures/base';

test.describe('PWA review reminders', () => {
  test.use({ serviceWorkers: 'allow' });

  test('updates caches and never replays an API response while offline', async ({
    browserConsoleContract,
    context,
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
    });
    await page.evaluate(() => navigator.serviceWorker.ready);

    await page.evaluate(async () => {
      const legacy = await caches.open('qalem-data-v2');
      await legacy.put(
        '/api/health?owner=user-a',
        new Response(JSON.stringify({ owner: 'user-a' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const current = await navigator.serviceWorker.getRegistration('/');
      await current?.unregister();
      const updated = await navigator.serviceWorker.register('/sw.js?e2e-update=1', {
        scope: '/',
        updateViaCache: 'none',
      });
      if (updated.installing) {
        await new Promise<void>((resolve, reject) => {
          updated.installing?.addEventListener('statechange', function listener() {
            if (this.state === 'activated') resolve();
            if (this.state === 'redundant')
              reject(new Error('Updated service worker is redundant'));
          });
        });
      }
    });

    await expect
      .poll(() =>
        page.evaluate(async () => ({
          caches: await caches.keys(),
          legacyPayload: Boolean(await caches.match('/api/health?owner=user-a')),
        })),
      )
      .toEqual({
        caches: expect.arrayContaining(['qalem-shell-v3']),
        legacyPayload: false,
      });
    const cacheNames = await page.evaluate(() => caches.keys());
    expect(cacheNames).not.toContain('qalem-data-v2');

    const online = await page.evaluate(async () => {
      const response = await fetch('/api/health?owner=user-a');
      return { body: await response.json(), status: response.status };
    });
    expect(online.status).toBe(200);

    await context.setOffline(true);
    browserConsoleContract.expectHttpError('/api/health', 503);
    const offlineApi = await page.evaluate(async () => {
      const response = await fetch('/api/health?owner=user-a');
      return { body: await response.json(), status: response.status };
    });
    expect(offlineApi).toEqual({
      body: { error: 'offline', message: 'You are currently offline' },
      status: 503,
    });

    const offlineNavigation = await page.goto('/review', { waitUntil: 'domcontentloaded' });
    expect(offlineNavigation?.status()).toBe(200);
    expect(await page.title()).toBe('Qalem');
    await expect(page.getByText('Hors connexion — reconnectez-vous pour continuer.')).toBeVisible();
    await context.setOffline(false);
  });

  test('writes no preference when browser permission is denied', async ({ page }) => {
    await page.route('**/api/notification-preferences', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          email: false,
          whatsapp: false,
          whatsappNumber: null,
          locale: 'en-US',
        }),
      }),
    );
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Notifications' }).click();

    const pushSwitch = page.getByRole('switch', { name: 'Push notifications' });
    await expect(pushSwitch).not.toBeChecked();
    await expect(pushSwitch).toBeDisabled();
    await expect(
      page.getByText('Browser notifications are blocked. Update your browser permissions'),
    ).toBeVisible();

    const stored = await page.evaluate(() => ({
      account: localStorage.getItem(
        'qalem-notification-prefs:00000000-0000-4000-8000-000000000001',
      ),
      legacy: localStorage.getItem('qalem-notification-prefs'),
    }));
    expect(stored).toEqual({ account: null, legacy: null });
  });
});
