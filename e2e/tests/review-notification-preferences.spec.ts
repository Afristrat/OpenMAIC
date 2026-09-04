import { expect, test } from '../fixtures/base';

test('persists explicit email and WhatsApp opt-ins without accepting an ambiguous number', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en-US'));
  const writes: unknown[] = [];
  await page.route('**/api/notification-preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      writes.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, ...body }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        email: false,
        whatsapp: false,
        whatsappNumber: null,
        locale: 'en-US',
      }),
    });
  });

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Notifications' }).click();
  await page.getByRole('switch', { name: 'Email' }).click();
  await page.getByRole('switch', { name: 'WhatsApp' }).click();
  const number = page.getByLabel('WhatsApp number');
  await number.fill('0600000000');
  await expect(page.getByText('Enter an international number beginning with +')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save preferences' })).toBeDisabled();

  await number.fill('+212 600-000-000');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect
    .poll(() => writes)
    .toEqual([
      {
        email: true,
        whatsapp: true,
        whatsappNumber: '+212600000000',
        locale: 'en-US',
      },
    ]);
});
