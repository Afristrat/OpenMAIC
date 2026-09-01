import { expect, test } from '../fixtures/base';

test.describe('Invitation-only authentication (S6-021)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  });

  test('offers existing-account login only without an invitation', async ({ page }) => {
    await page.goto('/auth');

    await expect(page.getByRole('tab', { name: 'Connectez-vous' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Créer un compte' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Google|GitHub/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /invité/i })).toHaveCount(0);
    await expect(page.getByText(/Les inscriptions sont fermées/)).toBeVisible();
  });

  test('offers account creation only from a named invitation link', async ({ page }) => {
    await page.goto('/auth?invite=one-time-token');

    await expect(page.getByRole('tab', { name: 'Créer un compte' })).toBeVisible();
    await expect(
      page.locator('[role="tabpanel"]:visible').getByLabel('Adresse e-mail'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Créer un compte' })).toBeVisible();
  });
});
