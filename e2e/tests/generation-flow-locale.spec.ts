import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage();
const LOCALE_CASES = [
  {
    locale: 'fr-FR',
    dir: 'ltr',
    requirement: 'Expliquer la photosynthèse',
    heading: /génération de cours/i,
  },
  {
    locale: 'ar-MA',
    dir: 'rtl',
    requirement: 'شرح عملية التركيب الضوئي',
    heading: /جارٍ توليد المقرر/i,
  },
] as const;

test.describe('Generation flow — locale coverage (S0-008)', () => {
  for (const { locale, dir, requirement, heading } of LOCALE_CASES) {
    test(`home → persistent generation in ${locale}`, async ({ page, mockApi }) => {
      await page.addInitScript(
        ({ settings, activeLocale }) => {
          localStorage.setItem('settings-storage', settings);
          localStorage.setItem('locale', activeLocale);
        },
        { settings: SETTINGS_STORAGE, activeLocale: locale },
      );
      await mockApi.mockClassroomGenerationJob(`e2e-${locale}`);

      const home = new HomePage(page);
      await home.goto();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);

      await home.fillRequirement(requirement);
      await home.configureAnimation();
      await home.submit();

      await expect(page).toHaveURL(
        new RegExp(`/generation-status\\?jobId=e2e-${locale.replace('-', '\\-')}$`),
      );
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
    });
  }
});
