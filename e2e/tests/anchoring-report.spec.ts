import { test, expect } from '../fixtures/base';

test.describe('Reporting d’ancrage agrégé (S3-009)', () => {
  for (const [locale, note] of [
    ['fr-FR', 'Une valeur absente ne signifie pas zéro.'],
    ['ar-MA', 'القيمة الغائبة لا تعني صفرًا.'],
    ['en-US', 'A missing value does not mean zero.'],
  ]) {
    test(`missing observations and coverage ${locale}`, async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
      await page.route('**/api/organizations/org-report/reports?*', (route) =>
        route.fulfill({
          json: {
            metrics: {
              totalLearners: 1,
              activeClassrooms: 1,
              avgScore: null,
              completionRate: null,
            },
            formations: [
              {
                stage_id: 'empty',
                name: 'No measures yet',
                learner_count: 0,
                avg_score: null,
                completion_rate: null,
              },
            ],
          },
        }),
      );
      await page.route('**/api/organizations/org-report/anchoring-report', (route) =>
        route.fulfill({ json: { anchoring: null } }),
      );
      await page.goto('/org/org-report/reports');
      await expect(page.getByRole('note')).toContainText(note);
      const row = page.getByRole('row').filter({ hasText: 'No measures yet' });
      await expect(row).toContainText('—');
      await expect(row).not.toContainText('%');
      await expect(page.getByText('0%', { exact: true })).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
    });
  }
  test('removes old figures when loading another period fails', async ({
    page,
    browserConsoleContract,
  }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'en-US'));
    let fail = false;
    browserConsoleContract.expectHttpError('/api/organizations/org-report/reports', 503);
    await page.route('**/api/organizations/org-report/reports?*', (route) =>
      route.fulfill({
        status: fail ? 503 : 200,
        json: fail
          ? { success: false }
          : {
              success: true,
              metrics: { totalLearners: 2, activeClassrooms: 1, avgScore: 75, completionRate: 60 },
              formations: [
                {
                  stage_id: 'proof',
                  name: 'Previous period formation',
                  learner_count: 2,
                  avg_score: 75,
                  completion_rate: 60,
                },
              ],
            },
      }),
    );
    await page.route('**/api/organizations/org-report/anchoring-report', (route) =>
      route.fulfill({ json: { anchoring: null } }),
    );
    await page.goto('/org/org-report/reports');
    await expect(page.getByText('Previous period formation')).toBeVisible();
    fail = true;
    await page.getByRole('combobox').click();
    await page.getByRole('option').first().click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Reporting data could not be loaded.' }),
    ).toBeVisible();
    await expect(page.getByText('Previous period formation')).toHaveCount(0);
    await expect(page.getByText('75%', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /PDF/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /CSV/ })).toBeDisabled();
  });
  test('affiche les indicateurs dans le temps sans donnée individuelle', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));

    const reportPayload = {
      success: true,
      metrics: {
        totalLearners: 2,
        activeClassrooms: 1,
        avgScore: 75,
        completionRate: 60,
      },
      formations: [
        {
          stage_id: 'stage-aggregate',
          name: 'Formation agrégée',
          learner_count: 2,
          avg_score: 75,
          completion_rate: 60,
        },
      ],
    };
    const anchoringPayload = {
      success: true,
      anchoring: {
        participation_rate: 50,
        hot_average_score: 80,
        cold_30_average_score: 70,
        cold_60_retention_delta: -20,
        delivery_open_rate: 50,
      },
    };

    await page.route('**/api/organizations/org-report/reports?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reportPayload),
      }),
    );
    await page.route('**/api/organizations/org-report/anchoring-report', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(anchoringPayload),
      }),
    );

    await page.goto('/org/org-report/reports');

    const anchoringSection = page.getByRole('region', { name: 'Ancrage dans le temps' });
    await expect(anchoringSection).toBeVisible();
    await expect(anchoringSection).toContainText('Participation au programme');
    await expect(anchoringSection).toContainText('50%');
    await expect(anchoringSection).toContainText('80% → 70%');
    await expect(anchoringSection).toContainText('-20 pts');
    await expect(page.getByText('Formation agrégée')).toBeVisible();
    await expect(page.getByText('Apprenant secret')).toHaveCount(0);
    await expect(page.locator('a[href*="learner"], a[href*="user"]')).toHaveCount(0);

    expect(JSON.stringify(reportPayload)).not.toContain('user_id');
    expect(JSON.stringify(anchoringPayload)).not.toContain('user_id');
  });
});
