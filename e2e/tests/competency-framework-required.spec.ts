import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage({}, 4);

test.describe('Métier ESCO obligatoire dès le plan', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'en-US');
    }, SETTINGS_STORAGE);
  });

  test('refuse de lancer le plan sans métier, sans appeler le serveur', async ({ page }) => {
    let planRequests = 0;
    await page.route('**/api/generate-classroom/plan', (route) => {
      planRequests += 1;
      return route.abort();
    });
    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Un cours sur la trésorerie des TPE');
    await home.configureAnimation();

    await home.enterButton.click();

    await expect(home.competencyFramework.getByRole('alert')).toBeVisible();
    await expect(home.competencyFramework.locator('section')).toHaveAttribute(
      'data-invalid',
      'true',
    );
    expect(planRequests).toBe(0);
  });

  test('retient les compétences essentielles du métier et en garde au moins une', async ({
    page,
  }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.chooseCompetencyFramework();

    const boxes = home.competencyFramework.getByRole('checkbox');
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();

    await boxes.nth(0).uncheck();
    // La dernière compétence ne peut pas être retirée : une au moins est exigée.
    await boxes.nth(1).uncheck();
    await expect(boxes.nth(1)).toBeChecked();
  });

  test('envoie le métier et les compétences choisis avec la demande de plan', async ({
    page,
    mockApi,
  }) => {
    const generationJob = await mockApi.mockClassroomGenerationJob();
    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Un cours sur la trésorerie des TPE');
    await home.configureAnimation();
    await home.submit();

    await expect.poll(() => generationJob.getPlanRequestBody()).toBeTruthy();
    const request = (await generationJob.getPlanRequestBody()) as {
      competencyFramework?: { occupationUri: string; skillUris: string[] };
    };
    expect(request.competencyFramework?.occupationUri).toBe(
      'http://data.europa.eu/esco/occupation/11111111-1111-4111-8111-111111111111',
    );
    expect(request.competencyFramework?.skillUris).toEqual([
      'http://data.europa.eu/esco/skill/a',
      'http://data.europa.eu/esco/skill/b',
    ]);
  });
});
