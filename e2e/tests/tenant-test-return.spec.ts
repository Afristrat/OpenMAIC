import { expect, test } from '../fixtures/base';

const E2E_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002';

test('maintient la sortie de super-administration visible pendant le test d’un tenant', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await page.route('**/api/account/is-admin', (route) =>
    route.fulfill({ json: { isAdmin: true } }),
  );

  await page.goto(`/app?orgId=${E2E_ORGANIZATION_ID}`);

  const banner = page.getByRole('status');
  await expect(banner).toContainText('Mode test du tenant : Qalem E2E');
  await expect(
    banner.getByRole('link', { name: 'Revenir à l’administration globale' }),
  ).toHaveAttribute('href', '/admin?tab=tenants');
});
