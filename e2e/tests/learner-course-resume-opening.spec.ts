import { expect, test } from '../fixtures/base';

const courseId = '00000000-0000-4000-8000-000000000081';
const organizationId = '00000000-0000-4000-8000-000000000002';
const deliveryId = '00000000-0000-4000-8000-000000000082';

test('atteste l’ouverture du rappel avant de reprendre la formation ciblée', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await page.addInitScript(
    (orgId) => localStorage.setItem('qalem-current-org-id', orgId),
    organizationId,
  );
  await page.route(`**/api/learner-courses/${courseId}/resume-target?*`, (route) =>
    route.fulfill({
      json: {
        success: true,
        target: {
          stageId: 'resume-stage',
          sceneId: 'resume-scene',
          activity: 'quiz',
          activityState: { draftAnswer: 'B' },
          positionMs: 0,
        },
      },
    }),
  );
  let openingCount = 0;
  await page.route(
    `**/api/learner-courses/${courseId}/resume-deliveries/${deliveryId}/open`,
    async (route) => {
      openingCount += 1;
      expect(route.request().method()).toBe('POST');
      await route.fulfill({ status: 204, body: '' });
    },
  );
  await page.route('**/api/classroom?id=resume-stage*', (route) =>
    route.fulfill({
      json: {
        success: true,
        stage: {
          id: 'resume-stage',
          name: 'Formation reprise',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        scenes: [],
      },
    }),
  );
  let savedPreferences: Record<string, unknown> | null = null;
  await page.route(`**/api/courses/${courseId}/notification-preferences`, async (route) => {
    if (route.request().method() === 'PUT') {
      savedPreferences = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { ...savedPreferences, nextReminderAt: null } });
      return;
    }
    await route.fulfill({
      json: {
        pausedUntil: null,
        dailyCap: null,
        minimumIntervalHours: null,
        timezone: null,
        quietStart: null,
        quietEnd: null,
        disabled: false,
        nextReminderAt: null,
      },
    });
  });

  await page.goto(
    `/app?learnerResumeCourseId=${courseId}` +
      `&learnerResumeOrgId=${organizationId}` +
      `&learnerResumeDeliveryId=${deliveryId}`,
  );

  await expect.poll(() => openingCount).toBe(1);
  await expect(page).toHaveURL(/\/classroom\/resume-stage\?/);
  await page.getByText('Rappels de cette formation', { exact: true }).click();
  await page.getByLabel('Fuseau horaire propre à cette formation').fill('America/Toronto');
  await page.getByLabel('Début des heures calmes').fill('22:00');
  await page.getByLabel('Fin des heures calmes').fill('07:00');
  await page.getByLabel('Désactiver tous les rappels de cette formation').check();
  await page.getByRole('button', { name: 'Enregistrer les préférences' }).click();
  await expect
    .poll(() => savedPreferences)
    .toMatchObject({
      timezone: 'America/Toronto',
      quietStart: '22:00',
      quietEnd: '07:00',
      disabled: true,
    });
});
