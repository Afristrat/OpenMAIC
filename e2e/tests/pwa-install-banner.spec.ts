import { devices, expect, test } from '@playwright/test';

const dismissedKey = 'qalem-pwa-dismissed';

async function dispatchInstallPrompt(
  page: import('@playwright/test').Page,
  outcome: 'accepted' | 'dismissed',
): Promise<void> {
  await page.evaluate((choice) => {
    Object.assign(window, { __installPromptCalls: 0 });
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        Object.assign(window, {
          __installPromptCalls:
            ((window as typeof window & { __installPromptCalls: number }).__installPromptCalls ??
              0) + 1,
        });
      },
      userChoice: Promise.resolve({ outcome: choice }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

test.describe('PWA install banner', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('pwa-test-initialized')) {
        localStorage.removeItem(key);
        localStorage.setItem('locale', 'fr-FR');
        sessionStorage.setItem('pwa-test-initialized', 'true');
      }
    }, dismissedKey);
  });

  test('only proposes an applicable Chromium install and persists refusal', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByTestId('pwa-install-banner');
    await expect(banner).toBeHidden();

    await dispatchInstallPrompt(page, 'dismissed');
    await expect(banner).toBeVisible();
    await page.getByRole('button', { name: "Installer l'application" }).click();
    await expect(banner).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => ({
            dismissed: localStorage.getItem(key),
            prompts: (window as typeof window & { __installPromptCalls: number })
              .__installPromptCalls,
          }),
          dismissedKey,
        ),
      )
      .toEqual({ dismissed: 'true', prompts: 1 });

    await page.reload();
    await dispatchInstallPrompt(page, 'accepted');
    await expect(banner).toBeHidden();
  });

  test('hides the proposal when installation completes outside the banner', async ({ page }) => {
    await page.goto('/');
    await dispatchInstallPrompt(page, 'accepted');
    const banner = page.getByTestId('pwa-install-banner');
    await expect(banner).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(banner).toBeHidden();
  });

  test('does not propose installation in standalone mode', async ({ page }) => {
    await page.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string): MediaQueryList =>
        query === '(display-mode: standalone)'
          ? ({ matches: true, media: query } as MediaQueryList)
          : originalMatchMedia(query);
    });
    await page.goto('/');
    await dispatchInstallPrompt(page, 'accepted');
    await expect(page.getByTestId('pwa-install-banner')).toBeHidden();
  });
});

test.describe('PWA install banner on iOS', () => {
  const iPhone = devices['iPhone 13'];
  test.use({
    userAgent: iPhone.userAgent,
    viewport: iPhone.viewport,
    screen: iPhone.screen,
    deviceScaleFactor: iPhone.deviceScaleFactor,
    isMobile: iPhone.isMobile,
    hasTouch: iPhone.hasTouch,
  });

  test('shows manual instructions in browser mode and respects dismissal', async ({ page }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('pwa-test-initialized')) {
        localStorage.removeItem(key);
        localStorage.setItem('locale', 'fr-FR');
        sessionStorage.setItem('pwa-test-initialized', 'true');
      }
    }, dismissedKey);
    await page.goto('/');

    const banner = page.getByTestId('pwa-install-banner');
    await expect(banner).toContainText(
      'ouvrez le menu Partager du navigateur, puis choisissez « Sur l’écran d’accueil »',
    );
    await expect(page.getByRole('button', { name: "Installer l'application" })).toHaveCount(0);
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(banner).toBeHidden();
  });
});
