import { expect, test } from '../fixtures/base';

const E2E_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000002';

test('maintient la sortie de super-administration visible pendant le test d’un tenant', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await page.addInitScript(
    (organizationId) => localStorage.setItem('qalem-current-org-id', organizationId),
    E2E_ORGANIZATION_ID,
  );
  await page.route('**/api/account/is-admin', (route) =>
    route.fulfill({ json: { isAdmin: true } }),
  );
  await page.route('**/api/courses/catalog?**', (route) =>
    route.fulfill({ json: { courses: [], unpublished: [] } }),
  );
  await page.route('**/api/courses/orphaned?**', (route) =>
    route.fulfill({ json: { courses: [], nextCursor: null } }),
  );

  await page.goto(`/app?orgId=${E2E_ORGANIZATION_ID}`);

  const banner = page.getByRole('status');
  await expect(banner).toContainText('Mode test du tenant : Qalem E2E');

  await page.goto('/catalog');
  await expect(banner).toContainText('Mode test du tenant : Qalem E2E');
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('qalem-super-admin-tested-tenant-id')))
    .toBe(E2E_ORGANIZATION_ID);

  await banner
    .getByRole('button', {
      name: 'Quitter le mode test et revenir à mon espace super-administrateur',
    })
    .click();

  await expect(page).toHaveURL(/\/admin\?tab=tenants$/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('qalem-current-org-id')))
    .toBeNull();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('qalem-super-admin-tested-tenant-id')))
    .toBeNull();
});
