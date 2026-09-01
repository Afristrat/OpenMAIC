import { expect, test } from '../fixtures/base';

test.describe('Administration des tenants (S6-022)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isAdmin: true }),
      }),
    );
  });

  test('provisionne un tenant, réserve ses sièges et permet sa suspension', async ({ page }) => {
    let tenantCreated = false;
    let tenantStatus: 'active' | 'suspended' = 'active';
    let creditBalanceMicrounits = 0;

    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.route('**/api/admin/tenants', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        expect(body).toMatchObject({
          name: 'Institut Atlas',
          seatLimit: 12,
          administratorEmail: 'admin@atlas.ma',
        });
        tenantCreated = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            tenant: { id: 'tenant-atlas' },
            administratorInvitationUrl: 'https://qalem.ma/auth?invite=tenant-token',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          tenants: tenantCreated
            ? [
                {
                  id: 'tenant-atlas',
                  name: 'Institut Atlas',
                  sector: 'education',
                  default_locale: 'fr-FR',
                  status: tenantStatus,
                  seat_limit: 12,
                  memberCount: 0,
                  pendingInvitationCount: 1,
                  creditBalanceMicrounits,
                },
              ]
            : [],
        }),
      });
    });
    await page.route('**/api/admin/tenants/tenant-atlas', async (route) => {
      const body = route.request().postDataJSON() as { status?: 'active' | 'suspended' };
      tenantStatus = body.status ?? tenantStatus;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, tenant: { id: 'tenant-atlas' } }),
      });
    });

    await page.goto('/admin?tab=tenants');
    await page.getByLabel('Nom du tenant').fill('Institut Atlas');
    await page.getByLabel('Plafond de sièges').first().fill('12');
    await page.getByLabel('E-mail de l’administrateur').fill('admin@atlas.ma');
    await page.getByRole('button', { name: 'Créer et inviter' }).click();

    await expect(page.getByLabel('Lien d’invitation administrateur à transmettre')).toHaveValue(
      'https://qalem.ma/auth?invite=tenant-token',
    );
    await expect(page.getByText('Sièges occupés ou réservés: 1/12')).toBeVisible();

    await page.route('**/api/admin/tenants/tenant-atlas/credits', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body).toMatchObject({
        entryType: 'allocation',
        amountCredits: 250,
        reason: 'Crédit pilote',
      });
      creditBalanceMicrounits = 250_000_000;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, balanceCredits: 250 }),
      });
    });
    await page.getByLabel('Montant en crédits').fill('250');
    await page.getByLabel('Motif auditable').fill('Crédit pilote');
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByText('Solde de crédits: 250')).toBeVisible();

    await page.getByRole('button', { name: 'Suspendre' }).click();
    await expect(page.getByText('Suspendu')).toBeVisible();
  });

  test('conserve la navigation et le formulaire en RTL arabe', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'ar-MA'));
    await page.route('**/api/admin/tenants', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, tenants: [] }),
      }),
    );

    await page.goto('/admin?tab=tenants');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'إنشاء مؤسسة' })).toBeVisible();
    await expect(page.getByLabel('الحد الأقصى للمقاعد')).toBeVisible();
  });
});
