import { expect, test } from '../fixtures/base';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/account/is-admin', (route) => route.fulfill({ json: { isAdmin: true } }));
});

for (const locale of ['fr-FR', 'ar-MA', 'en-US']) {
  test(`MCP reflects responses and refreshes (${locale})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
    let probes = 0;
    await page.route('**/api/admin/mcp', (route) => {
      probes++;
      return route.fulfill({ json: { success: true, servers: [{
        id: 'actual-docs', name: 'Actual documents', status: probes === 1 ? 'connected' : 'error', toolCount: 7,
      }] } });
    });
    await page.goto('/admin?tab=mcp');
    const table = page.getByRole('table');
    await expect(table.getByRole('rowheader', { name: 'Actual documents' })).toBeVisible();
    await expect(table.getByRole('cell', { name: '7', exact: true })).toBeVisible();
    await expect(page.getByText('http://localhost:3001/mcp')).toHaveCount(0);
    const labels = locale === 'fr-FR' ? ['Connecté', 'Vérifier les connexions', 'Erreur de connexion']
      : locale === 'ar-MA' ? ['متصل', 'التحقق من الاتصالات', 'خطأ في الاتصال']
        : ['Connected', 'Check connections', 'Connection error'];
    await expect(table.getByRole('cell', { name: labels[0], exact: true })).toBeVisible();
    if (locale === 'ar-MA') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByRole('button', { name: labels[1], exact: true }).click();
    await expect(table.getByRole('cell', { name: labels[2], exact: true })).toBeVisible();
    expect(probes).toBe(2);
  });
}

test('MCP distinguishes empty, forbidden and invalid responses', async ({ page, browserConsoleContract }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  let probes = 0;
  browserConsoleContract.expectHttpError('/api/admin/mcp', 403);
  await page.route('**/api/admin/mcp', (route) => {
    probes++;
    if (probes === 1) return route.fulfill({ json: { success: true, servers: [] } });
    if (probes === 2) return route.fulfill({ status: 403, json: { error: 'private diagnostics' } });
    return route.fulfill({ json: { success: true, servers: [{ name: 'Invalid configuration' }] } });
  });
  await page.goto('/admin?tab=mcp');
  await expect(page.getByRole('status').filter({ hasText: 'Aucune connexion MCP activée.' })).toBeVisible();
  await page.getByRole('button', { name: 'Vérifier les connexions' }).click();
  await expect(page.getByRole('alert')).toHaveText('Cette vérification est réservée au super-administrateur connecté.');
  await expect(page.getByText('private diagnostics')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vérifier les connexions' }).click();
  await expect(page.getByRole('alert')).toHaveText('Le test de connexion a échoué.');
  await expect(page.getByRole('table')).toHaveCount(0);
});
