import { test, expect } from '../fixtures/base';

const TRANSMISSION_ID = 'e2e-transmission-ready';

async function mockDeliveredTransmission(page: import('@playwright/test').Page) {
  await page.route(`**/api/transmissions/${TRANSMISSION_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        transmission: {
          id: TRANSMISSION_ID,
          status: 'done',
          error: null,
          recipientName: 'Amina',
        },
      }),
    }),
  );
  await page.route(`**/api/transmissions/${TRANSMISSION_ID}/content`, (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'Content-Type': 'video/mp4',
      },
      body: 'mock-video',
    }),
  );
}

test.describe('Transmission privée', () => {
  test('présente le destinataire et lit le support en ligne sans lien de téléchargement', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await mockDeliveredTransmission(page);

    await page.goto(`/transmissions/${TRANSMISSION_ID}`);

    await expect(page.getByRole('heading', { name: 'Votre support est prêt' })).toBeVisible();
    await expect(page.getByText('Session remise à Amina')).toBeVisible();
    await expect(page.locator('video')).toBeVisible();
    await expect(page.locator('video source')).toHaveAttribute(
      'src',
      `/api/transmissions/${TRANSMISSION_ID}/content`,
    );
    await expect(page.locator('a[download]')).toHaveCount(0);
  });
});
