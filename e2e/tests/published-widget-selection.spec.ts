import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const templateId = '00000000-0000-4000-8000-000000000059';
const versionId = '00000000-0000-4000-8000-000000000060';
const session = JSON.stringify({
  sessionId: 'e2e-published-widget-selection',
  requirements: {
    requirement: 'Construire un cours de gestion.',
    language: 'fr-FR',
  },
  pdfText: '',
  pdfImages: [],
  imageStorageIds: [],
  sceneOutlines: [
    {
      id: 'outline-widget',
      type: 'plugin',
      title: 'Exercice de marge',
      description: 'Calculer puis interpréter une marge.',
      keyPoints: ['Calcul', 'Interprétation'],
      teachingObjective: 'Calculer une marge.',
      estimatedDuration: 180,
      order: 0,
      pluginType: 'cash-flow-simulator',
    },
  ],
  currentStep: 'generating',
  previewPhase: 'review',
});

test('selects and preserves the exact published widget version after reload', async ({
  page,
  mockApi,
}) => {
  await page.addInitScript(
    ({ settings, generationSession }) => {
      localStorage.setItem('locale', 'fr-FR');
      localStorage.setItem('settings-storage', settings);
      if (!sessionStorage.getItem('generationSession')) {
        sessionStorage.setItem('generationSession', generationSession);
      }
    },
    {
      settings: createSettingsStorage({ reviewOutlineEnabled: true }),
      generationSession: session,
    },
  );
  await page.route('**/api/plugins?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plugins: [{ type: 'cash-flow-simulator', name: 'Simulateur de trésorerie' }],
      }),
    }),
  );
  await page.route('**/api/widget-templates', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        templates: [
          {
            templateId,
            versionId,
            versionNumber: 7,
            title: 'Calculateur de marge',
            locale: 'fr-FR',
          },
        ],
      }),
    }),
  );
  await mockApi.setupGenerationMocks();

  await page.goto('/generation-preview');

  const selector = page.getByLabel('Plugins');
  await expect(selector).toBeVisible();
  await selector.selectOption(`widget:${templateId}:${versionId}`);
  await expect(selector).toHaveValue(`widget:${templateId}:${versionId}`);
  await expect(selector.locator('option:checked')).toHaveText('Calculateur de marge · v7');

  const persisted = await page.evaluate(() => {
    const raw = sessionStorage.getItem('generationSession');
    const outline = raw ? JSON.parse(raw).sceneOutlines?.[0] : null;
    return {
      pluginType: outline?.pluginType,
      templateId: outline?.widgetTemplateId,
      versionId: outline?.widgetTemplateVersionId,
    };
  });
  expect(persisted).toEqual({ pluginType: 'published-widget', templateId, versionId });

  await page.reload();
  await expect(page.getByLabel('Plugins')).toHaveValue(`widget:${templateId}:${versionId}`);
});
