import { expect, test } from '@playwright/test';

test('the root route serves the commercial homepage, not the generator', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('commercial-homepage')).toBeVisible();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Vos contenus deviennent une classe qui parle, questionne et fait agir.',
    }),
  ).toBeVisible();
  await expect(page.locator('a[href^="mailto:contact@qalem.ma"]').first()).toBeVisible();
  await expect(page.locator('#agents article')).toHaveCount(10);
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(page.getByText('Essayer gratuitement')).toHaveCount(0);
  await expect(page.locator('a[href="/app"]')).toHaveCount(0);
});

test('the commercial homepage switches to Arabic and applies RTL', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'العربية' }).click();

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'يتحوّل محتواكم إلى فصل يشرح ويسأل ويدفع إلى التطبيق.',
    }),
  ).toBeVisible();
});
