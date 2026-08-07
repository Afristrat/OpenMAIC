import { test, expect } from '../fixtures/base';

test.describe('System learning catalogs', () => {
  test('shows the six system blueprints on the generation page', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto('/app', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Trames' }).click();
    await expect(page.getByRole('heading', { name: 'Méthode de conception' })).toBeVisible();
    const performanceBlueprint = page.getByRole('button', {
      name: /Réussir une performance professionnelle/,
    });
    await expect(performanceBlueprint).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Prendre une décision argumentée/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Rappel opérationnel court/ })).toBeVisible();
    await performanceBlueprint.click();
    await expect(page.locator('textarea').first()).toHaveValue(
      /Commencez par la situation professionnelle à réussir/,
    );
  });

  test('serves and displays the ten canonical agents', async ({ page, request }) => {
    const response = await request.get('/api/marketplace/agents?limit=20');
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      agents: Array<{ id: string; name: string }>;
    };
    expect(payload.success).toBe(true);
    expect(payload.agents.filter((agent) => agent.id.startsWith('system-persona-'))).toHaveLength(
      10,
    );

    await page.goto('/marketplace/agents', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Younes', { exact: true })).toBeVisible();
    await expect(page.getByText('Hanae', { exact: true })).toBeVisible();
    await expect(page.getByText('Layla', { exact: true })).toBeVisible();
  });
});
