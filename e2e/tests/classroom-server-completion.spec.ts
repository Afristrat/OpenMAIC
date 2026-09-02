import { expect, test } from '../fixtures/base';

const STAGE_ID = 'server-complete-certificate-stage';
const QUIZ_SCENE_ID = 'server-complete-certificate-quiz';

test('offers course completion for an authoritative server classroom', async ({ page }) => {
  await page.addInitScript(
    ({ quizSceneId }) => {
      localStorage.setItem('locale', 'en-US');
      localStorage.setItem(
        `quizAnswers:${quizSceneId}`,
        JSON.stringify({ 'server-certificate-question': 'a' }),
      );
    },
    { quizSceneId: QUIZ_SCENE_ID },
  );

  await page.route('**/api/classroom?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        canEdit: false,
        canViewSources: false,
        classroom: {
          id: STAGE_ID,
          url: `/classroom/${STAGE_ID}`,
          stage: {
            id: STAGE_ID,
            name: 'Authoritative server course',
            description: '',
            language: 'en-US',
            style: 'professional',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          scenes: [
            {
              id: QUIZ_SCENE_ID,
              stageId: STAGE_ID,
              type: 'quiz',
              title: 'Server certificate quiz',
              order: 0,
              content: {
                type: 'quiz',
                questions: [
                  {
                    id: 'server-certificate-question',
                    type: 'single',
                    question: 'Choose the correct answer',
                    options: [
                      { value: 'a', label: 'Correct' },
                      { value: 'b', label: 'Incorrect' },
                    ],
                    answer: ['a'],
                    hasAnswer: true,
                    points: 1,
                  },
                ],
              },
              actions: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      }),
    });
  });

  await page.goto(`/classroom/${STAGE_ID}`);
  await page.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 15_000 });

  await page.getByText('Course complete', { exact: true }).click();

  await expect(page.getByRole('button', { name: 'Get certificate' })).toBeVisible();
});
