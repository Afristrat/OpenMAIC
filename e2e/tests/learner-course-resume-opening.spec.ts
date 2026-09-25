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
  await page.route(`**/api/courses/${courseId}/notification-preferences`, (route) =>
    route.fulfill({
      json: {
        pausedUntil: null,
        dailyCap: null,
        minimumIntervalHours: null,
        nextReminderAt: null,
      },
    }),
  );

  await page.goto(
    `/app?learnerResumeCourseId=${courseId}` +
      `&learnerResumeOrgId=${organizationId}` +
      `&learnerResumeDeliveryId=${deliveryId}`,
  );

  await expect.poll(() => openingCount).toBe(1);
  await expect(page).toHaveURL(/\/classroom\/resume-stage\?/);
});
