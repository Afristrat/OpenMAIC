import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { defaultTheme } from '../fixtures/test-data/scene-content';

const ORG_ID = '00000000-0000-4000-8000-000000000002';

function thumbnail(src: string, poster?: string) {
  return {
    id: 'persistent-thumbnail',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: defaultTheme,
    elements: [
      {
        id: 'video-el',
        type: 'video',
        src,
        mediaRef: 'gen_vid_1',
        poster,
        left: 0,
        top: 0,
        width: 1000,
        height: 562.5,
        rotate: 0,
        autoplay: false,
      },
    ],
  };
}

async function mockPersistentClassrooms(page: Page, classrooms: Array<Record<string, unknown>>) {
  await page.route(`**/api/classroom?orgId=${ORG_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, classrooms }),
    }),
  );
  await page.route('**/api/classroom?id=*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    const item = classrooms.find((classroom) => classroom.id === id);
    if (!item) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        classroom: {
          id,
          stage: {
            id,
            name: item.name,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          },
          scenes: [
            {
              id: `${id}-scene`,
              stageId: id,
              type: 'slide',
              title: 'Video preview',
              order: 0,
              content: { type: 'slide', canvas: item.thumbnail },
            },
          ],
          createdAt: new Date(Number(item.createdAt)).toISOString(),
        },
      }),
    });
  });
}

test.describe('Home persistent video thumbnails', () => {
  test('renders a durable video thumbnail and opens its classroom', async ({ page }) => {
    await mockPersistentClassrooms(page, [
      {
        id: 'persistent-video-stage',
        name: 'Persistent Video Course',
        sceneCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        thumbnail: thumbnail(
          '/api/classroom-media/persistent-video-stage/video.mp4',
          '/api/classroom-media/persistent-video-stage/poster.png',
        ),
      },
    ]);

    await page.goto('/app');
    const card = page
      .locator('.group.cursor-pointer')
      .filter({ hasText: 'Persistent Video Course' });
    const video = card.locator('[data-video-element] video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute(
      'src',
      '/api/classroom-media/persistent-video-stage/video.mp4',
    );
    await expect(video).toHaveAttribute(
      'poster',
      '/api/classroom-media/persistent-video-stage/poster.png',
    );
    await expect(card.getByTestId('thumbnail-video-indicator')).toBeVisible();

    await card.click({ position: { x: 24, y: 24 } });
    await expect(page).toHaveURL(/\/classroom\/persistent-video-stage$/);
  });

  test('shows a play badge without a broken video for an unresolved placeholder', async ({
    page,
  }) => {
    await mockPersistentClassrooms(page, [
      {
        id: 'unresolved-video-stage',
        name: 'Unresolved Video Course',
        sceneCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        thumbnail: thumbnail('gen_vid_1'),
      },
    ]);

    await page.goto('/app');
    const card = page
      .locator('.group.cursor-pointer')
      .filter({ hasText: 'Unresolved Video Course' });
    await expect(card.getByTestId('thumbnail-video-indicator')).toBeVisible();
    await expect(card.locator('[data-video-element] video')).toHaveCount(0);
  });
});
