import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { mockOutlines } from '../fixtures/test-data/scene-outlines';

for (const [locale, dir] of [
  ['fr-FR', 'ltr'],
  ['ar-MA', 'rtl'],
  ['en-US', 'ltr'],
]) {
  test(`optimization advice is explicit and optional in ${locale}`, async ({ page, mockApi }) => {
    await page.addInitScript(
      ({ locale, settings }) => {
        localStorage.setItem('locale', locale);
        localStorage.setItem('settings-storage', settings);
      },
      { locale, settings: createSettingsStorage() },
    );
    const api = await mockApi.mockClassroomGenerationJob('s037-advice');
    await page.route('**/api/generate-classroom/plan/plan-s037-advice', (route) =>
      route.fulfill({
        json: {
          success: true,
          status: 'succeeded',
          done: true,
          generationRequest: api.getPlanRequestBody(),
          result: {
            courseTitle: 'S037',
            languageDirective: 'Teach in the selected language.',
            syllabus: {
              audience: 'Adults',
              prerequisites: 'None',
              overallObjective: 'Apply a process',
              learningObjectives: ['Apply a process'],
              totalDurationMinutes: 30,
              deliveryMode: 'Virtual',
              assessmentStrategy: 'Quiz',
              expectedDeliverable: 'Checklist',
            },
            outlines: mockOutlines,
            optimization: {
              recommendedSceneOrder: mockOutlines.map((outline) => outline.type),
              difficultyModifier: -0.2,
              sampleSize: 1,
              selectedSequenceSampleSize: 1,
              observedMeanQuizScore: 0.4,
              selectedSequenceMeanQuizScore: 0.4,
              evidence: 'observational',
              observationWindowLimit: 1000,
            },
          },
        },
      }),
    );
    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Présenter les étapes d’un processus');
    await home.configureAnimation();
    await home.submit();
    const advice = page.getByTestId('optimization-advice');
    await expect(advice).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    const expected =
      locale === 'fr-FR' ? 'Observations : 1' : locale === 'en-US' ? 'Observations: 1' : '1 ملاحظة';
    await expect(advice).toContainText(expected);
    await expect(page.getByTestId('optimization-sequence-status')).toContainText(
      locale === 'fr-FR'
        ? 'correspond au conseil'
        : locale === 'en-US'
          ? 'matches the advice'
          : 'يطابق التوصية',
    );
  });
}
