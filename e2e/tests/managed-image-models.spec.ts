import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { HomePage } from '../pages/home.page';

const KNOWN_MODEL_ID = 'gemini-3.1-flash-image';
const KNOWN_MODEL_LABEL = 'Gemini 3.1 Flash Image (rapide)';
const UNKNOWN_MODEL_ID = 'future-image-model';

test.describe('Modèles image LiteLLM administrés', () => {
  test('conserve l’identifiant exact d’un modèle inconnu dans tout le parcours', async ({
    page,
    mockApi,
  }) => {
    await page.addInitScript(
      (settings) => {
        localStorage.setItem('settings-storage', settings);
        localStorage.setItem('locale', 'fr-FR');
      },
      createSettingsStorage({
        imageGenerationEnabled: true,
        imageProviderId: 'openai-image',
        imageModelId: KNOWN_MODEL_ID,
        imageProvidersConfig: {},
        autoConfigApplied: true,
      }),
    );
    await page.route('**/api/server-providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: { openai: { models: ['gpt-4o'] } },
          tts: {},
          asr: {},
          pdf: {},
          image: {
            'openai-image': { models: [KNOWN_MODEL_ID, UNKNOWN_MODEL_ID] },
          },
          video: {},
          webSearch: {},
        }),
      }),
    );
    const generationJob = await mockApi.mockClassroomGenerationJob('managed-image-model-e2e');
    const home = new HomePage(page);

    await Promise.all([page.waitForResponse('**/api/server-providers'), home.goto()]);
    await page.getByRole('button', { name: 'Médias', exact: true }).click();

    const imageModelSelect = page.getByRole('combobox', { name: "Génération d'images" });
    await expect(imageModelSelect).toContainText(KNOWN_MODEL_LABEL);
    await imageModelSelect.click();
    await expect(page.getByRole('option', { name: KNOWN_MODEL_LABEL, exact: true })).toBeVisible();
    await page.getByRole('option', { name: UNKNOWN_MODEL_ID, exact: true }).click();
    await expect(imageModelSelect).toContainText(UNKNOWN_MODEL_ID);

    await page.getByRole('button', { name: 'Paramètres avancés', exact: true }).click();
    const settingsDialog = page.getByRole('dialog');
    await expect(settingsDialog).toBeVisible();
    await expect(settingsDialog.getByText(KNOWN_MODEL_LABEL, { exact: true })).toBeVisible();
    await expect(settingsDialog.getByText(KNOWN_MODEL_ID, { exact: true })).toBeVisible();
    const unknownModelLabels = settingsDialog.getByText(UNKNOWN_MODEL_ID, { exact: true });
    await expect(unknownModelLabels).toHaveCount(2);
    await expect(unknownModelLabels.first()).toBeVisible();
    await settingsDialog.getByRole('button', { name: 'Fermer', exact: true }).click();

    await home.fillRequirement('Créer une formation sur la médiation professionnelle');
    await home.configureAnimation();
    await home.submit();
    await expect(page.getByRole('heading', { name: 'Plan de formation' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer et générer le cours' }).click();
    await expect(page).toHaveURL(/\/generation-status\?jobId=managed-image-model-e2e$/);

    expect(generationJob.getPlanRequestBody()).toMatchObject({
      imageProviderId: 'openai-image',
      imageModelId: UNKNOWN_MODEL_ID,
    });
    expect(generationJob.getSubmittedBody()).toMatchObject({
      imageProviderId: 'openai-image',
      imageModelId: UNKNOWN_MODEL_ID,
    });
  });
});
