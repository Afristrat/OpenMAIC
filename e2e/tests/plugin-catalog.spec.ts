import { expect, test } from '../fixtures/base';

test.describe('Catalogue des expériences interactives', () => {
  test('ouvre un simulateur métier utilisable et recalcule ses résultats', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto('/plugins');

    const card = page.getByTestId('plugin-card-cash-flow-simulator');
    await expect(card).toContainText('Simulateur de trésorerie');
    await card.getByRole('button', { name: 'Essayer l’expérience' }).click();

    const plugin = page.frameLocator('[data-testid="plugin-preview"]');
    await expect(
      plugin.getByRole('heading', {
        name: 'Garderez-vous une trésorerie positive pendant douze mois ?',
      }),
    ).toBeVisible();

    const endingCash = plugin.getByText('Trésorerie finale').locator('..');
    const initialResult = await endingCash.textContent();
    const startingCash = plugin.getByLabel('Trésorerie de départ');
    await startingCash.fill('10000');
    await expect(endingCash).not.toHaveText(initialResult ?? '');
  });
});
