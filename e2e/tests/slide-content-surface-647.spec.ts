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

  test('background, z-order, and image bar surface in Pro mode', async ({
    browserConsoleContract,
    page,
  }, testInfo) => {
    browserConsoleContract.expectHttpError('/api/classroom', 404);
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
    let submittedAspectRatio = '';
    let briefTranscript = '';
    await page.route('**/api/generate/editor-image-brief', async (route) => {
      const body = route.request().postDataJSON() as { transcript?: string };
      briefTranscript = body.transcript ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          prompt:
            'An original photosynthesis diagram showing sunlight entering a leaf, then oxygen and glucose leaving it, with clear arrows and no decorative person.',
          negativePrompt: 'tiny text, watermark, decorative person',
        }),
      });
    });
    await page.route('**/api/generate/image', async (route) => {
      const body = route.request().postDataJSON() as { prompt?: string; aspectRatio?: string };
      submittedPrompt = body.prompt ?? '';
      submittedAspectRatio = body.aspectRatio ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result: {
            url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"%3E%3Crect width="400" height="400" rx="24" fill="%23eefbf0"/%3E%3Ccircle cx="72" cy="72" r="34" fill="%23facc15"/%3E%3Cpath d="M98 105 L155 165" stroke="%23ca8a04" stroke-width="10" marker-end="url(%23a)"/%3E%3Cellipse cx="215" cy="215" rx="82" ry="120" fill="%2322c55e" transform="rotate(35 215 215)"/%3E%3Cpath d="M165 278 Q215 215 270 145" stroke="%23f0fdf4" stroke-width="10" fill="none"/%3E%3Cpath d="M270 210 L350 155 M270 245 L350 300" stroke="%2316a34a" stroke-width="10"/%3E%3Ctext x="18" y="135" font-family="Arial" font-size="22" fill="%2371350a"%3ESunlight%3C/text%3E%3Ctext x="295" y="135" font-family="Arial" font-size="22" fill="%23166534"%3EOxygen%3C/text%3E%3Ctext x="285" y="335" font-family="Arial" font-size="22" fill="%23166534"%3EGlucose%3C/text%3E%3Cdefs%3E%3Cmarker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"%3E%3Cpath d="M0 0 L8 4 L0 8z" fill="%23ca8a04"/%3E%3C/marker%3E%3C/defs%3E%3C/svg%3E',
          },
        }),
      });
    });
    await page.getByRole('button', { name: 'AI image', exact: true }).click();
    const createLayer = page.locator('.element-create-selection');
    await expect(createLayer).toBeVisible();
    // A click exercises the editor's documented 200 × 200 fallback. Pointer
    // drag uses the same onCreated path with the dragged rectangle.
    await createLayer.click({ position: { x: 300, y: 180 } });

    const imageDialogTitle = page.getByRole('heading', {
      name: 'Create an image from the narration',
    });
    await expect(imageDialogTitle).toBeVisible();
    const imagePrompt = page.getByLabel('Generation prompt');
    await expect(imagePrompt).not.toHaveValue('');
    expect(briefTranscript).not.toBe('');
    await imagePrompt.fill(`${await imagePrompt.inputValue()}\nUse a clear process diagram.`);
    await page.getByRole('button', { name: 'Generate and insert' }).click();
    await expect(imageDialogTitle).toHaveCount(0);
    expect(submittedPrompt).toContain('Use a clear process diagram.');
    expect(submittedAspectRatio).toBe('1:1');
    const generatedImage = page.locator('.editable-element-image');
    await expect(generatedImage).toHaveCount(1);
    await expect(generatedImage.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/);
    const generatedImageBox = await generatedImage.boundingBox();
    expect(generatedImageBox).not.toBeNull();
    expect(generatedImageBox?.width ?? 0).toBeGreaterThan(100);
    expect(generatedImageBox?.height ?? 0).toBeGreaterThan(100);
    await testInfo.attach('original-photosynthesis-illustration', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
});
