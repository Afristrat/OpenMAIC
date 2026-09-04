import { test, expect } from '../fixtures/base';

test.describe('Reporting d’ancrage agrégé (S3-009)', () => {
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
