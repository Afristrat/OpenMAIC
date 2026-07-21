import { test, expect } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const TEST_STAGE_ID = 'e2e-plugin-stage';
const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

test.use({ serviceWorkers: 'block' });

async function seedPluginScene(page: import('@playwright/test').Page) {
  await page.route('**/api/account/is-admin', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"isAdmin":false}' }),
  );

  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
    localStorage.setItem('locale', 'fr-FR');
  }, SETTINGS_STORAGE);

  await page.goto('/app', { waitUntil: 'networkidle' });
  await page.evaluate((stageId) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('MAIC-Database');

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
        const now = Date.now();

        tx.objectStore('stages').put({
          id: stageId,
          name: 'Atelier JavaScript',
          description: 'Classroom avec un exercice de code interactif',
          language: 'fr-FR',
          style: 'professional',
          createdAt: now,
          updatedAt: now,
        });

        tx.objectStore('scenes').put({
          id: 'scene-plugin-code',
          stageId,
          type: 'plugin',
          title: 'Fonction somme',
          order: 0,
          content: {
            type: 'plugin',
            pluginType: 'code-sandbox',
            data: {
              language: 'javascript',
              title: 'Fonction somme',
              instructions: 'Complétez la fonction puis exécutez les tests.',
              starterCode: 'function sum(a, b) { return 0; }',
              solution: 'function sum(a, b) { return a + b; }',
              tests: [{ name: 'addition simple', input: 'sum(2, 3)', expected: '5' }],
            },
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
          stageId,
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
  }, TEST_STAGE_ID);
}

test.describe('Classroom plug-in scene', () => {
  test('persists and renders a generated code exercise inside the classroom', async ({ page }) => {
    await seedPluginScene(page);
    await page.goto(`/classroom/${TEST_STAGE_ID}`);

    await expect(page.getByRole('heading', { name: 'Fonction somme' })).toBeVisible();

    const plugin = page.frameLocator('iframe[title*="Plugin Scene"]');
    await expect(plugin.locator('#exercise-title')).toHaveText('Fonction somme');
    await expect(plugin.locator('#panel-instructions')).toContainText(
      'Complétez la fonction puis exécutez les tests.',
    );
    await expect(plugin.locator('#btn-run')).toBeVisible();
    await expect(plugin.locator('#btn-reset')).toBeVisible();
  });
});
