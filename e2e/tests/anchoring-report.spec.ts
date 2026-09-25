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
      await page.route('**/api/organizations/org-report/anchoring-report?*', (route) =>
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
    await page.route('**/api/organizations/org-report/anchoring-report?*', (route) =>
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
        hot_relevance_average: 4.5,
        hot_relevance_response_count: 2,
        hot_return_intent_average: 4,
        hot_return_intent_response_count: 2,
        cold_application_average: 3.5,
        cold_application_response_count: 2,
        resume_open_rate: 50,
        resume_sent_count: 4,
        resume_opened_count: 2,
        delivery_open_rate: 50,
        hot_decline_count: 1,
        cold_decline_count: 1,
      },
      window: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      },
      definitions: {
        relevance: 'Moyenne déclarée ; dénominateur : 2 réponses à chaud.',
        returnIntent: 'Moyenne déclarée ; dénominateur : 2 réponses à chaud.',
        application: 'Moyenne déclarée ; dénominateur : 2 réponses à froid.',
        effectiveResume: '2 ouvertures authentifiées / 4 relances de reprise acceptées.',
      },
    };

    await page.route('**/api/organizations/org-report/reports?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reportPayload),
      }),
    );
    await page.route('**/api/organizations/org-report/anchoring-report?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(anchoringPayload),
      }),
    );

    await page.goto('/org/org-report/reports');

    const anchoringSection = page.getByRole('region', { name: 'Ancrage dans le temps' });
    await expect(anchoringSection).toBeVisible();
    await expect(anchoringSection).toContainText('Pertinence déclarée');
    await expect(anchoringSection).toContainText('Souhait de revenir');
    await expect(anchoringSection).toContainText('Application déclarée des acquis');
    await expect(anchoringSection).toContainText('Reprise effective');
    await expect(anchoringSection).toContainText('4,5 / 5');
    await expect(anchoringSection).toContainText('4 / 5');
    await expect(anchoringSection).toContainText('3,5 / 5');
    await expect(anchoringSection).toContainText('2 / 4');
    await expect(anchoringSection).toContainText('Refus conservés : 1 à chaud · 1 à froid.');
    await expect(anchoringSection).toContainText('Aucun gain d’apprentissage n’est déduit');
    await expect(page.getByText('Formation agrégée')).toBeVisible();
    await expect(page.getByText('Apprenant secret')).toHaveCount(0);
    await expect(page.locator('a[href*="learner"], a[href*="user"]')).toHaveCount(0);

    expect(JSON.stringify(reportPayload)).not.toContain('user_id');
    expect(JSON.stringify(anchoringPayload)).not.toContain('user_id');
  });
});
