import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const COURSE_ID = '00000000-0000-4000-8000-000000000031';
const MANIFEST_ID = '00000000-0000-4000-8000-000000000032';

for (const labels of [
  {
    locale: 'fr-FR',
    resume: 'Reprendre le plan enregistré',
    title: 'Intitulé de la formation',
    notice: 'Plan récupéré depuis le canevas',
  },
  {
    locale: 'ar-MA',
    resume: 'استئناف الخطة المحفوظة',
    title: 'عنوان التكوين',
    notice: 'استُعيدت الخطة من القالب',
  },
  {
    locale: 'en-US',
    resume: 'Resume saved plan',
    title: 'Course title',
    notice: 'Plan recovered from this course',
  },
]) {
  test(`signale un plan récupéré sans lancement implicite : ${labels.locale}`, async ({ page }) => {
    const orgId = '00000000-0000-4000-8000-000000000002';
    await page.addInitScript(
      ({ settings, locale }) => {
        localStorage.setItem('settings-storage', settings);
        localStorage.setItem('locale', locale);
      },
      { settings: createSettingsStorage(), locale: labels.locale },
    );
    await page.route(`**/api/courses/${COURSE_ID}/resume?*`, (route) =>
      route.fulfill({
        json: {
          courseId: COURSE_ID,
          orgId,
          sourceManifestId: MANIFEST_ID,
          language: 'fr-FR',
          plan,
          planOrigin: 'linked_canvas',
        },
      }),
    );
    let generated = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/generate-classroom')) generated = true;
    });
    await page.goto(`/app?resumeCourseId=${COURSE_ID}&resumeOrgId=${orgId}`);
    await page.getByRole('button', { name: labels.resume, exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText(labels.notice);
    await expect(page.getByLabel(labels.title, { exact: true })).toHaveValue(plan.courseTitle);
    if (labels.locale === 'ar-MA') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(generated).toBe(false);
  });
}

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
      teachingObjective: 'Produire une preuve d’application utilisable.',
      estimatedDuration: 900,
      order: 2,
    },
  ],
};

test('reprend le plan enregistré sans génération avant confirmation', async ({ page }) => {
  const orgId = '00000000-0000-4000-8000-000000000002';
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
    localStorage.setItem('locale', 'fr-FR');
  }, createSettingsStorage());
  await page.route(`**/api/courses/${COURSE_ID}/resume?*`, (route) =>
    route.fulfill({
      json: {
        courseId: COURSE_ID,
        orgId,
        sourceManifestId: MANIFEST_ID,
        language: 'fr-FR',
        plan,
      },
    }),
  );
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/generate-classroom', async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { jobId: 'resume-e2e' } });
  });
  await page.route('**/api/generate-classroom/resume-e2e', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 'succeeded',
        progress: 100,
        result: { url: '/classroom/resume-e2e' },
      },
    }),
  );
  await page.route('**/api/classroom?id=resume-e2e', (route) =>
    route.fulfill({
      json: {
        success: true,
        stage: { id: 'resume-e2e', name: 'Resumed', createdAt: Date.now(), updatedAt: Date.now() },
        scenes: [],
      },
    }),
  );
  await page.goto(`/app?resumeCourseId=${COURSE_ID}&resumeOrgId=${orgId}`);
  await page.getByRole('button', { name: 'Reprendre le plan enregistré', exact: true }).click();
  await expect(page.getByLabel('Intitulé de la formation')).toHaveValue(plan.courseTitle);
  expect(submitted).toBeUndefined();
  await page.getByRole('button', { name: 'Confirmer et générer le cours' }).click();
  await expect(page).toHaveURL(/\/classroom\/resume-e2e$/);
  expect(submitted).toMatchObject({
    courseId: COURSE_ID,
    orgId,
    sourceManifestId: MANIFEST_ID,
    approvedPlan: plan,
    learningApproach: 'andragogy',
  });
});

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
