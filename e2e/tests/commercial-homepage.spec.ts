import { expect, test } from '@playwright/test';

test('the root route serves the commercial homepage, not the generator', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('commercial-homepage')).toBeVisible();
  await expect(page.locator('a[href="/app"]').first()).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
});
