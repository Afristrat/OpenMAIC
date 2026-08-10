import { test, expect } from '../fixtures/base';
import { GenerationPreviewPage } from '../pages/generation-preview.page';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });
const GENERATION_SESSION = JSON.stringify({
  sessionId: 'slide-content-e2e',
  requirements: { requirement: 'Explain photosynthesis', language: 'en-US' },
  pdfText: '',
  pdfImages: [],
  imageStorageIds: [],
  sceneOutlines: null,
  currentStep: 'generating',
});

/**
 * PR3b — slide content surface completion (#647). Verifies the new
 * surface-level affordances render and anchor correctly in Pro edit mode:
 * the slide-background insert item, z-order on the element bar, and the
 * image-type bar (replace/flip). Icon-class selectors keep the
 * assertions locale-independent.
 */
test.describe('Slide content surface (#647)', () => {
  test.beforeEach(async ({ page, mockApi }) => {
    await page.addInitScript(
      ({ settings, session }) => {
        localStorage.setItem('settings-storage', settings);
        sessionStorage.setItem('generationSession', session);
      },
      { settings: SETTINGS_STORAGE, session: GENERATION_SESSION },
    );
    await mockApi.setupGenerationMocks();
  });

  test('background, z-order, and image bar surface in Pro mode', async ({ page }, testInfo) => {
    // Generate a classroom through the mocked pipeline, then enter Pro mode.
    const preview = new GenerationPreviewPage(page);
    await preview.goto();
    await preview.waitForRedirectToClassroom();

    const classroom = new ClassroomPage(page);
    await classroom.waitForLoaded();
    await expect(classroom.sidebarScenes.first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('switch').click();
    await expect(page.getByTestId('slide-nav-rail')).toBeVisible({ timeout: 10_000 });

    // --- Slide background: a PaintBucket insert item opens a solid/image popover.
    const bgInsert = page.locator('button:has(.lucide-paint-bucket)');
    // The insert toolbar may start collapsed — expand it if the item isn't shown.
    if ((await bgInsert.count()) === 0) {
      await page
        .locator('button:has(.lucide-plus), button:has(.lucide-pencil-ruler)')
        .first()
        .click();
    }
    await expect(bgInsert).toBeVisible({ timeout: 10_000 });
    await bgInsert.click();
    // The background popover hosts the solid color picker (react-colorful).
    await expect(page.locator('.color-picker, .react-colorful').first()).toBeVisible();
    await testInfo.attach('slide-background-popover', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');

    // --- Z-order on the text element bar: select the title, expect to-front/to-back.
    const selectedText = page.locator('.editable-element-text').first();
    await selectedText.click();
    await expect(page.locator('.lucide-bring-to-front').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.lucide-send-to-back').first()).toBeVisible();

    const initialBox = await selectedText.boundingBox();
    expect(initialBox).not.toBeNull();
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await expect
      .poll(async () => (await selectedText.boundingBox())?.x ?? 0)
      .toBeGreaterThan(initialBox?.x ?? 0);
    await testInfo.attach('text-bar-zorder', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // --- Image insert popover hosts the picker (the image-type bar's
    // replace/flip ops are covered by image-actions.test.ts and the
    // image-flip round-trip suite, which don't need a live canvas).
    await page.keyboard.press('Escape');
    await page.locator('button:has(.lucide-image)').first().click();
    await expect(page.getByPlaceholder(/https/i)).toBeVisible({ timeout: 10_000 });
    await testInfo.attach('image-insert-popover', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');

    // --- AI image zone: draw a target rectangle, review the narration-grounded
    // prompt, then insert the generated image into that exact zone.
    let submittedPrompt = '';
    await page.route('**/api/generate/image', async (route) => {
      const body = route.request().postDataJSON() as { prompt?: string };
      submittedPrompt = body.prompt ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result: {
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          },
        }),
      });
    });
    await page.getByRole('button', { name: 'Draw the area for the new image' }).click();
    const viewport = page.locator('.viewport').first();
    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).not.toBeNull();
    await page.mouse.move((viewportBox?.x ?? 0) + 300, (viewportBox?.y ?? 0) + 180);
    await page.mouse.down();
    await page.mouse.move((viewportBox?.x ?? 0) + 520, (viewportBox?.y ?? 0) + 320);
    await page.mouse.up();

    await expect(page.getByRole('dialog')).toContainText('Create an image from the narration');
    const imagePrompt = page.getByLabel('Generation prompt');
    await expect(imagePrompt).not.toHaveValue('');
    await imagePrompt.fill(`${await imagePrompt.inputValue()}\nUse a clear process diagram.`);
    await page.getByRole('button', { name: 'Generate and insert' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(submittedPrompt).toContain('Use a clear process diagram.');
    await expect(page.locator('.editable-element-image')).toHaveCount(1);
  });
});
