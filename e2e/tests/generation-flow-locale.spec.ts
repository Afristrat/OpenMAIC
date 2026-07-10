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
      await mockApi.mockSceneContent();
      await mockApi.mockSceneActions();

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
