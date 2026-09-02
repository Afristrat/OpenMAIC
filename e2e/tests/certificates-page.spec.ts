import { test, expect } from '../fixtures/base';

const certificate = {
  id: '00000000-0000-4000-8000-000000000081',
  user_id: '00000000-0000-4000-8000-000000000001',
  stage_id: 'stage-certificate-e2e',
  course_name: 'Pilotage budgétaire',
  learner_name: 'Amina',
  completion_date: '2026-09-02T12:00:00.000Z',
  score: 84,
  skills: ['Arbitrage'],
  verification_code: 'QAL-2026-PERSIST1',
  issued_by: 'Qalem',
  org_id: null,
  created_at: '2026-09-02T12:00:00.000Z',
};

test.describe('Page Mes certificats (U-008)', () => {
  test('retrouve le certificat du bénéficiaire après rechargement et permet sa consultation', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.route('**/api/certificates', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, certificates: [certificate] }),
      }),
    );

    await page.goto('/certificates');
    await expect(page.getByRole('heading', { name: 'Mes certificats' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pilotage budgétaire/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: /Pilotage budgétaire/ })).toBeVisible();
    await page.getByRole('button', { name: /Pilotage budgétaire/ }).click();
    await expect(page.locator('.cert-verify-code')).toHaveText('QAL-2026-PERSIST1');
  });

  for (const { locale, dir, heading, empty } of [
    {
      locale: 'fr-FR',
      dir: 'ltr',
      heading: 'Mes certificats',
      empty: 'Vos expériences d’apprentissage terminées apparaîtront ici.',
    },
    {
      locale: 'en-US',
      dir: 'ltr',
      heading: 'My certificates',
      empty: 'Your completed learning experiences will appear here.',
    },
    {
      locale: 'ar-MA',
      dir: 'rtl',
      heading: 'شهاداتي',
      empty: 'ستظهر هنا تجاربك التعليمية المكتملة.',
    },
  ] as const) {
    test(`affiche l’état vide en ${locale}`, async ({ page }) => {
      await page.addInitScript(
        (activeLocale) => localStorage.setItem('locale', activeLocale),
        locale,
      );
      await page.route('**/api/certificates', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"success":true,"certificates":[]}',
        }),
      );

      await page.goto('/certificates');

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByText(empty)).toBeVisible();
    });
  }

  test('affiche une erreur récupérable quand le chargement échoue', async ({
    page,
    browserConsoleContract,
  }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    browserConsoleContract.expectHttpError('/api/certificates', 503);
    await page.route('**/api/certificates', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"success":false,"error":"Service indisponible"}',
      }),
    );

    await page.goto('/certificates');

    await expect(page.locator('main [role="alert"]')).toContainText(
      'Impossible de charger vos certificats.',
    );
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
});
