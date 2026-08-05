import { expect, test } from '../fixtures/base';

test.describe('Catalogue des expériences interactives', () => {
  test('présente les dix expériences installées', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto('/plugins');

    await expect(page.locator('[data-testid^="plugin-card-"]')).toHaveCount(10);
    await expect(page.getByTestId('plugin-card-controlled-spreadsheet')).toContainText(
      'Tableur contrôlé',
    );
    await expect(page.getByTestId('plugin-card-decision-tree-lab')).toContainText(
      'Arbre de décision',
    );
    await expect(page.getByTestId('plugin-card-industrial-process-simulator')).toContainText(
      'Simulation de processus industriel',
    );
  });

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

  test('recalcule un tableur contrôlé sans formule utilisateur', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto('/plugins');

    const card = page.getByTestId('plugin-card-controlled-spreadsheet');
    await card.getByRole('button', { name: 'Essayer l’expérience' }).click();

    const plugin = page.frameLocator('[data-testid="plugin-preview"]');
    const total = plugin.getByText('Budget total').locator('..');
    const initialResult = await total.textContent();
    await plugin.getByLabel('Ordinateurs · Quantité').fill('10');
    await expect(total).not.toHaveText(initialResult ?? '');
  });
});
