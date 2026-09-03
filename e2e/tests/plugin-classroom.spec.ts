import { test, expect } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const TEST_STAGE_ID = 'e2e-plugin-stage';
const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

interface SeededPluginScene {
  stageId: string;
  locale: 'fr-FR' | 'ar-MA' | 'en-US';
  title: string;
  description: string;
  pluginType: string;
  data: Record<string, unknown>;
}

const codeScene: SeededPluginScene = {
  stageId: TEST_STAGE_ID,
  locale: 'fr-FR',
  title: 'Fonction somme',
  description: 'Classroom avec un exercice de code interactif',
  pluginType: 'code-sandbox',
  data: {
    language: 'javascript',
    title: 'Fonction somme',
    instructions: 'Complétez la fonction puis exécutez les tests.',
    starterCode: 'function sum(a, b) { return 0; }',
    solution: 'function sum(a, b) { return a + b; }',
    tests: [{ name: 'addition simple', input: 'sum(2, 3)', expected: '5' }],
  },
};

async function seedPluginScene(
  page: import('@playwright/test').Page,
  seeded: SeededPluginScene = codeScene,
) {
  await page.addInitScript(
    ({ settings, locale }) => {
      if (window.top !== window.self) return;
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', locale);
    },
    { settings: SETTINGS_STORAGE, locale: seeded.locale },
  );

  await page.goto('/app', { waitUntil: 'networkidle' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState('domcontentloaded');
      await page.evaluate((scene) => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('MAIC-Database');

          request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
            const now = Date.now();

            tx.objectStore('stages').put({
              id: scene.stageId,
              name: scene.title,
              description: scene.description,
              language: scene.locale,
              style: 'professional',
              createdAt: now,
              updatedAt: now,
            });

            tx.objectStore('scenes').put({
              id: `scene-plugin-${scene.pluginType}`,
              stageId: scene.stageId,
              type: 'plugin',
              title: scene.title,
              order: 0,
              content: {
                type: 'plugin',
                pluginType: scene.pluginType,
                data: scene.data,
              },
              actions: [
                {
                  id: 'plugin-introduction',
                  type: 'speech',
                  text: 'Appliquons maintenant les paramètres et la valeur de retour.',
                  actor: 'teacher',
                },
              ],
              createdAt: now,
              updatedAt: now,
            });

            tx.objectStore('stageOutlines').put({
              stageId: scene.stageId,
              outlines: [],
              createdAt: now,
              updatedAt: now,
            });

            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };

          request.onerror = () => reject(request.error);
        });
      }, seeded);
      return;
    } catch (error) {
      if (attempt === 2 || !String(error).includes('Execution context was destroyed')) throw error;
    }
  }
}

test.describe('Classroom plug-in scene', () => {
  test.use({ serviceWorkers: 'allow' });

  test('persists and renders a generated code exercise inside the classroom', async ({
    page,
    mockApi,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    await seedPluginScene(page);
    const classroomApi = await mockApi.mockLocalClassroomFallback(TEST_STAGE_ID);
    await page.goto(`/classroom/${TEST_STAGE_ID}`);

    await expect(page.getByRole('heading', { name: 'Fonction somme' })).toBeVisible();

    const plugin = page.frameLocator('iframe[title*="Plugin Scene"]');
    await expect(plugin.locator('#exercise-title')).toHaveText('Fonction somme');
    await expect(plugin.locator('#panel-instructions')).toContainText(
      'Complétez la fonction puis exécutez les tests.',
    );
    await expect(plugin.locator('#btn-run')).toBeVisible();
    await expect(plugin.locator('#btn-reset')).toBeVisible();
    expect(classroomApi.expectedRequests.length).toBeGreaterThan(0);
    expect(new Set(classroomApi.expectedRequests)).toEqual(
      new Set([`GET /api/classroom?id=${TEST_STAGE_ID}`]),
    );
    expect(classroomApi.unexpectedRequests).toEqual([]);
  });

  for (const [locale, direction, title, inputLabel] of [
    ['fr-FR', 'ltr', 'Calculateur de marge', 'Prix'],
    ['ar-MA', 'rtl', 'حاسبة الهامش', 'السعر'],
    ['en-US', 'ltr', 'Margin calculator', 'Price'],
  ] as const) {
    test(`renders and updates a validated published widget in ${locale}`, async ({
      page,
      mockApi,
    }, testInfo) => {
      testInfo.setTimeout(60_000);
      const stageId = `e2e-published-widget-${locale}`;
      await seedPluginScene(page, {
        stageId,
        locale,
        title,
        description: title,
        pluginType: 'published-widget',
        data: {
          templateId: '00000000-0000-4000-8000-000000000059',
          versionId: '00000000-0000-4000-8000-000000000060',
          composition: {
            version: 1,
            locale,
            direction,
            title,
            inputs: [
              { id: 'price', label: inputLabel, initial: 100, min: 0, max: 10_000, step: 1 },
            ],
            computations: [
              {
                id: 'margin',
                label: title,
                expression: {
                  op: 'multiply',
                  args: [
                    { op: 'ref', id: 'price' },
                    { op: 'literal', value: 0.2 },
                  ],
                },
                unit: 'MAD',
              },
            ],
            nodes: [
              { id: 'price-input', type: 'number_input', inputId: 'price' },
              { id: 'margin-output', type: 'computed_value', computationId: 'margin' },
            ],
            rootNodeIds: ['price-input', 'margin-output'],
            goldenCases: [{ name: 'reference', inputs: { price: 100 }, expected: { margin: 20 } }],
          },
        },
      });
      await mockApi.mockLocalClassroomFallback(stageId);

      await page.goto(`/classroom/${stageId}`);

      const widget = page.locator(`section[aria-label="${title}"]`);
      await expect(widget).toHaveAttribute('dir', direction);
      await expect(widget.getByLabel(inputLabel)).toHaveValue('100');
      await expect(widget.getByText('20 MAD')).toBeVisible();
      await widget.getByLabel(inputLabel).fill('200');
      await expect(widget.getByText('40 MAD')).toBeVisible();
      await expect(page.locator('iframe[title*="Plugin Scene"]')).toHaveCount(0);
    });
  }
});
