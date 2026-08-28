import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const COURSE_ID = '00000000-0000-4000-8000-000000000031';
const MANIFEST_ID = '00000000-0000-4000-8000-000000000032';

const plan = {
  courseTitle: 'Décider quelles tâches automatiser',
  languageDirective: 'Deliver the entire course in French (fr-FR).',
  syllabus: {
    audience: 'Responsables opérationnels de PME marocaines',
    prerequisites: 'Débutants en IA',
    overallObjective: 'Prioriser une automatisation réversible.',
    learningObjectives: ['Cartographier une tâche récurrente.'],
    totalDurationMinutes: 40,
    deliveryMode: 'Classe virtuelle interactive',
    assessmentStrategy: 'Mise en pratique et preuve finale',
    expectedDeliverable: 'Une fiche d’expérimentation de deux semaines.',
  },
  outlines: [
    {
      id: 'import-chapter-1',
      type: 'slide',
      title: 'Chapitre 1 — Repérer une tâche utile',
      description: 'Cartographier une tâche et la classer avec une grille.',
      keyPoints: ['Une tâche stable est vérifiable.'],
      teachingObjective: 'Cartographier une tâche récurrente.',
      estimatedDuration: 1500,
      order: 1,
    },
    {
      id: 'import-final-evidence',
      type: 'slide',
      title: 'Preuve finale d’application',
      description: 'Produire une fiche d’expérimentation.',
      keyPoints: ['Définir un critère d’arrêt.'],
      order: 2,
    },
  ],
};

test('dépôt conforme → validation → outline éditable → cours prêt', async ({ page }) => {
  let submittedBody: Record<string, unknown> | undefined;
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
    localStorage.setItem('locale', 'fr-FR');
  }, createSettingsStorage());
  await page.route(/\/api\/courses\/import\?orgId=/, (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"enabled":true}' }),
  );
  await page.route('**/api/courses/import', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        importId: '00000000-0000-4000-8000-000000000030',
        courseId: COURSE_ID,
        sourceManifestId: MANIFEST_ID,
        validation: { status: 'conform', language: 'fr-FR', issues: [] },
        plan,
      }),
    });
  });
  await page.route('**/api/generate-classroom', async (route) => {
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"success":true,"jobId":"import-ready-e2e"}',
    });
  });
  await page.route('**/api/generate-classroom/import-ready-e2e', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        status: 'succeeded',
        progress: 100,
        result: { url: '/classroom/import-ready-e2e' },
      }),
    }),
  );
  await page.route('**/api/classroom?id=import-ready-e2e', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        stage: {
          id: 'import-ready-e2e',
          name: 'Canevas importé prêt',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        scenes: [],
      }),
    }),
  );

  await page.goto('/app');
  const chooser = page.waitForEvent('filechooser');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('course-canvas-import').click();
  await (
    await chooser
  ).setFiles({
    name: 'canevas.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Canevas conforme'),
  });

  await expect(page.getByRole('heading', { name: 'Plan de formation' })).toBeVisible();
  await expect(page.getByLabel('Intitulé de la formation')).toHaveValue(plan.courseTitle);
  await page.getByLabel('Intitulé de la formation').fill('Plan importé et relu');
  await page.getByRole('button', { name: 'Confirmer et générer le cours' }).click();

  await expect(page).toHaveURL(/\/classroom\/import-ready-e2e$/);
  expect(submittedBody).toMatchObject({
    courseId: COURSE_ID,
    sourceManifestId: MANIFEST_ID,
    approvedPlan: { courseTitle: 'Plan importé et relu' },
  });
});
