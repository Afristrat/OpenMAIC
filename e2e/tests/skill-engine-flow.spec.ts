import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

test.describe('Formation Design Pro — persistent generation path', () => {
  test('catalogue selection reaches the persistent job with the active skill', async ({ page }) => {
    let submittedBody: Record<string, unknown> | undefined;

    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'fr-FR');
    }, createSettingsStorage());

    await page.route('**/api/generate-classroom', async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, jobId: 'skill-engine-e2e' }),
      });
    });
    await page.route('**/api/generate-classroom/skill-engine-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'queued',
          step: 'initializing',
          progress: 5,
          message: 'Initialisation',
          scenesGenerated: 0,
        }),
      });
    });

    await page.goto('/skills');
    const card = page.locator('article, [class*="card"]').filter({
      hasText: 'Formation Design Pro',
    });
    await expect(card.first()).toBeVisible();
    await card.first().getByRole('button').last().click();

    await expect(page).toHaveURL(/\/app\?skill=formation-design-pro$/);
    await expect(page.getByTestId('learning-territory')).toHaveValue('Maroc');
    await expect(page.getByTestId('learning-currency')).toHaveValue('MAD');
    await page.locator('textarea').fill('Concevoir une formation aux entretiens difficiles');
    await page.getByTestId('learning-approach-andragogy').click();
    await page.getByRole('button', { name: 'Équilibré', exact: true }).click();
    await page
      .getByRole('button', {
        name: /accéder à la classe virtuelle|enter classroom|دخول الفصل/i,
      })
      .click();

    await expect(page).toHaveURL(/\/generation-status\?jobId=skill-engine-e2e$/);
    expect(submittedBody?.activeSkillId).toBe('formation-design-pro');
    expect(submittedBody?.orgId).toBe('00000000-0000-4000-8000-000000000002');
    expect(submittedBody?.learningApproach).toBe('andragogy');
    expect(submittedBody?.interactionLevel).toBe('balanced');
    expect(submittedBody?.learningContext).toEqual({
      territory: 'Maroc',
      currencyCode: 'MAD',
    });
  });
});
