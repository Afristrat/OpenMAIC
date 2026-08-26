import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

test.describe('Full Happy Path', () => {
  test.beforeEach(async ({ page, mockApi }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
    }, SETTINGS_STORAGE);
    await mockApi.mockClassroomGenerationJob();
  });

  test('home → persistent generation status', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.logo).toBeVisible();
    await expect(home.textarea).toBeVisible();
    await expect(home.enterButton).toBeDisabled();

    await home.fillRequirement('Explain photosynthesis');
    await expect(home.enterButton).toBeDisabled();
    await home.configureAnimation();
    await expect(home.enterButton).toBeEnabled();
    await home.submit();

    await expect(page.getByRole('heading', { name: 'Training plan' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and generate course' }).click();

    await expect(page).toHaveURL(/\/generation-status\?jobId=e2e-generation-job$/);
    await expect(page.getByRole('heading', { name: /generating course/i })).toBeVisible();
  });

  test('explains a media-provider failure without publishing an incomplete course', async ({
    page,
  }) => {
    await page.route('**/api/generate-classroom/e2e-media-failure', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          status: 'failed',
          progress: 72,
          failureCode: 'MEDIA_PROVIDER_UNAVAILABLE',
        }),
      });
    });

    await page.goto('/generation-status?jobId=e2e-media-failure');

    await expect(page.getByRole('heading', { name: 'Generation failed' })).toBeVisible();
    await expect(
      page.getByText('No incomplete course was published', { exact: false }),
    ).toBeVisible();
  });
});
