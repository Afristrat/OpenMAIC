import { test, expect } from '../fixtures/base';
import { buildDirectorExperimentReport } from '../../lib/orchestration/director-experiment-report';

const row = {
  cohort: 'data-driven',
  language: 'fr-FR',
  assignedUnits: 2,
  unitsWithQuiz: 1,
  missingQuizUnits: 1,
  meanQuizScore: 0,
  unitsWithReportedTurns: 1,
  decisions: 3,
  selections: 2,
  suggestionSelections: 2,
  changedSelections: 1,
  completedGenerations: 2,
  failedGenerations: 0,
  emptyGenerations: 0,
  abortedGenerations: 0,
  pendingGenerations: 1,
  linkedTurns: 2,
  meanLookupMs: 4,
};
for (const [locale, open, title, assigned, missing, score] of [
  [
    'fr-FR',
    'Voir le Director',
    'Comparaison du Director',
    'Participants assignés',
    'Participants sans score',
    'Score moyen des quiz',
  ],
  [
    'en-US',
    'View Director',
    'Director comparison',
    'Assigned participants',
    'Participants without a score',
    'Mean quiz score',
  ],
  [
    'ar-MA',
    'عرض الموجّه',
    'مقارنة الموجّه',
    'المشاركون المعيّنون',
    'المشاركون بلا درجات',
    'متوسط درجات الاختبارات',
  ],
]) {
  test(`Director report preserves missing values and tenant scope ${locale}`, async ({
    page,
    browserConsoleContract,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
    await page.route('**/api/organizations/org-report/reports?*', (route) =>
      route.fulfill({
        json: {
          metrics: { totalLearners: 2, activeClassrooms: 2, avgScore: null, completionRate: null },
          formations: ['first', 'second'].map((id) => ({
            stage_id: id,
            name: id,
            learner_count: 2,
            avg_score: null,
            completion_rate: null,
          })),
        },
      }),
    );
    await page.route('**/api/organizations/org-report/anchoring-report', (route) =>
      route.fulfill({ json: { anchoring: null } }),
    );
    let mode = 'data';
    browserConsoleContract.expectHttpError(
      '/api/organizations/org-report/director-experiment',
      403,
    );
    await page.route('**/api/organizations/org-report/director-experiment?*', (route) => {
      expect(new URL(route.request().url()).searchParams.has('userId')).toBe(false);
      return route.fulfill({
        status: mode === 'denied' ? 403 : 200,
        json:
          mode === 'denied' || mode === 'invalid'
            ? {}
            : buildDirectorExperimentReport(
                mode === 'empty'
                  ? []
                  : [
                      row,
                      {
                        ...row,
                        cohort: 'classic',
                        assignedUnits: 1,
                        unitsWithQuiz: 0,
                        missingQuizUnits: 1,
                        meanQuizScore: null,
                        suggestionSelections: 0,
                        changedSelections: 0,
                      },
                    ],
              ),
      });
    });
    await page.goto('/org/org-report/reports');
    await page.getByRole('button', { name: open, exact: true }).first().click();
    const report = page.getByRole('region', { name: title });
    await expect(
      report.getByRole('row').filter({ hasText: assigned }).getByRole('cell').first(),
    ).toHaveText(new Intl.NumberFormat(locale).format(2));
    await expect(
      report.getByRole('row').filter({ hasText: missing }).getByRole('cell').first(),
    ).toHaveText(new Intl.NumberFormat(locale).format(1));
    const scores = report.getByRole('row').filter({ hasText: score }).getByRole('cell');
    await expect(scores.first()).toHaveText(
      new Intl.NumberFormat(locale, { style: 'percent' }).format(0),
    );
    await expect(scores.last()).toHaveText('—');
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
    await expect(report.getByText('first', { exact: true })).toBeVisible();
    mode = 'invalid';
    await report.getByRole('button').click();
    await expect(report.getByRole('alert')).toBeVisible();
    await expect(report.getByRole('table')).toHaveCount(0);
    mode = 'empty';
    await page.getByRole('button', { name: open, exact: true }).last().click();
    await expect(report.getByRole('button')).toBeEnabled();
    await expect(report.getByRole('alert')).toHaveCount(0);
    await expect(report.getByText('second', { exact: true })).toBeVisible();
    await expect(report.getByRole('table')).toHaveCount(0);
    mode = 'denied';
    await page.getByRole('button', { name: open, exact: true }).first().click();
    await expect(report.getByRole('alert')).toBeVisible();
    await expect(report.getByRole('table')).toHaveCount(0);
  });
}
