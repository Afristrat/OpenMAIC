import { expect, test } from '../fixtures/base';

const composition = {
  version: 1,
  locale: 'fr-FR',
  direction: 'ltr',
  title: 'Calculateur de marge',
  inputs: [{ id: 'prix', label: 'Prix', initial: 100, min: 0, max: 10_000, step: 1, unit: 'MAD' }],
  computations: [
    { id: 'total', label: 'Total', expression: { op: 'literal', value: 42 }, unit: 'MAD' },
  ],
  nodes: [
    { id: 'saisie-prix', type: 'number_input', inputId: 'prix' },
    { id: 'resultat', type: 'computed_value', computationId: 'total' },
  ],
  rootNodeIds: ['saisie-prix', 'resultat'],
  goldenCases: [{ name: 'cas nominal', inputs: { prix: 100 }, expected: { total: 42 } }],
};

test.describe('Générateur de widgets administré (S6-028)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isAdmin: true }),
      }),
    );
  });

  test('corrige, régénère, prévisualise et publie sans exposer de JSON', async ({ page }) => {
    let generationCount = 0;
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.route('**/api/admin/widget-templates/generate', async (route) => {
      generationCount += 1;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.locale).toBe('fr-FR');
      expect(body.request).toContain(generationCount === 1 ? 'marge simple' : 'marge nette');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, composition }),
      });
    });
    await page.route('**/api/admin/widget-templates', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.title).toBe('Calculateur de marge');
      expect(body.composition).toEqual(composition);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          id: '00000000-0000-4000-8000-000000000060',
          template_id: '00000000-0000-4000-8000-000000000059',
          version_number: 1,
        }),
      });
    });
    await page.route('**/api/admin/widget-templates/*/preview', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          version: { id: '00000000-0000-4000-8000-000000000060' },
          evaluation: { values: { prix: 100, total: 42 }, conditions: {}, charts: {} },
        }),
      }),
    );
    await page.route('**/api/admin/widget-templates/*/publish', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.goto('/admin?tab=widgets');
    const prompt = page.getByLabel('Description du widget');
    await prompt.fill('Crée un calculateur de marge simple et pédagogique.');
    await page.getByRole('button', { name: 'Générer le widget' }).click();
    await expect(page.getByRole('heading', { name: 'Calculateur de marge' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' })).toBeDisabled();
    await expect(page.getByText(/"version"/)).toHaveCount(0);

    await prompt.fill('Crée plutôt un calculateur de marge nette et pédagogique.');
    await page.getByRole('button', { name: 'Régénérer le widget' }).click();
    expect(generationCount).toBe(2);

    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await expect(page.getByText('42 MAD')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' })).toBeEnabled();
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText('Widget publié')).toBeVisible();
  });

  test('localise le builder en arabe RTL', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'ar-MA'));
    await page.goto('/admin?tab=widgets');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'مولّد الوحدات التفاعلية' })).toBeVisible();
    await expect(page.getByLabel('وصف الوحدة التفاعلية')).toBeVisible();
  });

  test('localise le builder en anglais', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'en-US'));
    await page.goto('/admin?tab=widgets');

    await expect(page.getByRole('heading', { name: 'Interactive widget generator' })).toBeVisible();
    await expect(page.getByLabel('Widget description')).toBeVisible();
  });

  test('refuse la zone à un administrateur tenant', async ({ page }) => {
    await page.unroute('**/api/account/is-admin');
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isAdmin: false }),
      }),
    );
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto('/admin?tab=widgets');

    await expect(page.getByText('Vous n’êtes pas autorisé à visualiser cette zone.')).toBeVisible();
    await expect(page.getByLabel('Description du widget')).toHaveCount(0);
  });
});
