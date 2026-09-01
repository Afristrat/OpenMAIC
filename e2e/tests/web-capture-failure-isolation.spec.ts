import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';

test('web capture failure remains non-terminal and opens the completed course', async ({
  page,
}) => {
  const jobId = 'web-capture-failure-isolation';
  let polls = 0;

  // The server integration suite proves capture failure returns no image and still persists
  // the scene. This browser boundary proves that degraded run remains non-terminal for the user.
  await page.route(`**/api/generate-classroom/${jobId}`, async (route) => {
    polls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        polls <= 2
          ? { success: true, status: 'running', progress: 72 }
          : { success: true, status: 'succeeded', progress: 100, result: { url: '/app' } },
      ),
    });
  });

  await page.goto(`/generation-status?jobId=${jobId}`);
  await expect(page.getByRole('heading', { name: /generating course/i })).toBeVisible();

  await expect(page).toHaveURL(/\/app$/, { timeout: 7_000 });
  await expect(new HomePage(page).textarea).toBeVisible();
  expect(polls).toBeGreaterThanOrEqual(3);
});
