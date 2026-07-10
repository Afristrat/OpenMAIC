import type { SceneOutline } from '../../lib/types/generation';
import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { GenerationPreviewPage } from '../pages/generation-preview.page';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

/**
 * S0-008 gate: proves the generation → classroom pipeline works end-to-end
 * in fr-FR and ar-MA — not just en/zh (covered by full-happy-path.spec.ts).
 * Verifies both the UI chrome (HtmlDirectionManager RTL for ar-MA, localized
 * submit button) and that non-Latin/RTL scene content renders correctly in
 * the classroom sidebar, using locale-specific mocked outlines.
 */
const LOCALE_CASES: {
  locale: 'fr-FR' | 'ar-MA';
  dir: 'ltr' | 'rtl';
  requirement: string;
  outlines: SceneOutline[];
}[] = [
  {
    locale: 'fr-FR',
    dir: 'ltr',
    requirement: 'Explique la photosynthèse',
    outlines: [
      {
        id: 'outline-0',
        type: 'slide',
        title: 'Les bases de la photosynthèse',
        description: 'Introduction à la définition et à l’équation de réaction',
        keyPoints: ['Définition', 'Équation de réaction', 'Conversion énergétique'],
        order: 0,
      },
      {
        id: 'outline-1',
        type: 'slide',
        title: 'La phase claire',
        description: 'Absorption de la lumière et décomposition de l’eau',
        keyPoints: ['Absorption lumineuse', 'Photolyse de l’eau', 'Production d’ATP et de NADPH'],
        order: 1,
      },
    ],
  },
  {
    locale: 'ar-MA',
    dir: 'rtl',
    requirement: 'اشرح عملية التمثيل الضوئي',
    outlines: [
      {
        id: 'outline-0',
        type: 'slide',
        title: 'أساسيات التمثيل الضوئي',
        description: 'مقدمة عن تعريف التمثيل الضوئي ومعادلة التفاعل',
        keyPoints: ['التعريف', 'معادلة التفاعل', 'تحويل الطاقة'],
        order: 0,
      },
      {
        id: 'outline-1',
        type: 'slide',
        title: 'المرحلة الضوئية',
        description: 'امتصاص الضوء وتحلل الماء',
        keyPoints: ['امتصاص الضوء', 'التحليل الضوئي للماء', 'إنتاج ATP و NADPH'],
        order: 1,
      },
    ],
  },
];

test.describe('Generation flow — locale coverage (S0-008)', () => {
  test.beforeEach(async ({ page, mockApi }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
    }, SETTINGS_STORAGE);
    await mockApi.mockServerProviders();
  });

  for (const { locale, dir, requirement, outlines } of LOCALE_CASES) {
    test(`home → generation-preview → classroom in ${locale}`, async ({ page, mockApi }) => {
      // Force the UI locale before the app mounts (same mechanism as the
      // real LanguageSwitcher: localStorage key 'locale', read by
      // I18nProvider on mount — see lib/hooks/use-i18n.tsx).
      await page.addInitScript((loc) => {
        localStorage.setItem('locale', loc);
      }, locale);

      await mockApi.mockSceneOutlinesStream(outlines);
      // Custom (not MockApi's static default): the classroom sidebar reads
      // scene.title from the scene-content response's `effectiveOutline`
      // (see lib/hooks/use-scene-generator.ts: `contentResult.effectiveOutline
      // || outline`), not from the outline-stream data directly — so the
      // mock must echo back whichever locale outline was actually requested
      // for the title to reflect fr-FR/ar-MA content in the sidebar.
      await page.route('**/api/generate/scene-content', (route) => {
        const requestedOutline = route.request().postDataJSON()?.outline as
          | SceneOutline
          | undefined;
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            content: {
              type: 'slide',
              canvas: {
                id: 'slide-0',
                viewportSize: 1000,
                viewportRatio: 0.5625,
                theme: {
                  backgroundColor: '#ffffff',
                  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
                  fontColor: '#333333',
                  fontName: 'Microsoft Yahei',
                },
                elements: [
                  {
                    type: 'text',
                    id: 'title-el',
                    content: requestedOutline?.title ?? outlines[0].title,
                    left: 50,
                    top: 50,
                    width: 900,
                    height: 100,
                  },
                ],
              },
            },
            effectiveOutline: requestedOutline ?? outlines[0],
          }),
        });
      });
      // Also custom: the FINAL assembled scene (and its sidebar-displayed
      // .title) comes from the scene-actions response's `scene` object,
      // completely independent of the outline/content mocks above —
      // MockApi's static default (createMockSceneActionsResponse) always
      // returns a fixed Chinese title regardless of the request, which was
      // masking the fr-FR/ar-MA content entirely. Echo the requested
      // outline/stageId back instead.
      await page.route('**/api/generate/scene-actions', (route) => {
        const body = route.request().postDataJSON() as
          | { outline?: SceneOutline; stageId?: string }
          | undefined;
        const requestedOutline = body?.outline ?? outlines[0];
        const stageId = body?.stageId ?? 'test-stage';
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            scene: {
              id: `scene-${requestedOutline.order}`,
              stageId,
              type: 'slide',
              title: requestedOutline.title,
              order: requestedOutline.order,
              content: {
                type: 'slide',
                canvas: {
                  id: `slide-${requestedOutline.order}`,
                  viewportSize: 1000,
                  viewportRatio: 0.5625,
                  theme: {
                    backgroundColor: '#ffffff',
                    themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
                    fontColor: '#333333',
                    fontName: 'Microsoft Yahei',
                  },
                  elements: [
                    {
                      type: 'text',
                      id: 'title-el',
                      content: requestedOutline.title,
                      left: 50,
                      top: 50,
                      width: 900,
                      height: 100,
                    },
                  ],
                },
              },
              actions: [
                { id: 'action-0', type: 'speech', agent: 'teacher', text: requestedOutline.title },
              ],
            },
            previousSpeeches: [],
          }),
        });
      });

      // ── Phase 1: Home page, locale-aware UI ──────────────────────────
      const home = new HomePage(page);
      await home.goto();

      // HtmlDirectionManager must set the correct reading direction —
      // the whole point of RTL support (S0-005) proven end-to-end here.
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);

      await expect(home.logo).toBeVisible();
      await expect(home.textarea).toBeVisible();
      await expect(home.enterButton).toBeDisabled();

      await home.fillRequirement(requirement);
      await expect(home.enterButton).toBeEnabled();

      await home.submit();
      await page.waitForURL(/\/generation-preview/);

      // ── Phase 2: Generation preview ──────────────────────────────────
      const preview = new GenerationPreviewPage(page);
      await expect(preview.stepTitle).toBeVisible();
      await preview.waitForRedirectToClassroom();
      expect(page.url()).toMatch(/\/classroom\//);

      // ── Phase 3: Classroom — locale-specific content renders ─────────
      const classroom = new ClassroomPage(page);
      await classroom.waitForLoaded();

      await expect(classroom.sidebarScenes.first()).toBeVisible({ timeout: 10_000 });
      await expect(classroom.getSceneTitle(0)).toContainText(outlines[0].title);

      // RTL still holds once inside the classroom (not just on the home page).
      await expect(page.locator('html')).toHaveAttribute('dir', dir);

      const sceneCount = await classroom.sidebarScenes.count();
      if (sceneCount > 1) {
        await classroom.clickScene(1);
        await expect(classroom.sidebarScenes.nth(1)).toBeVisible();
        await expect(classroom.getSceneTitle(1)).toContainText(outlines[1].title);
      }
    });
  }
});
