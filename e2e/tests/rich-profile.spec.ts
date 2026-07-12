import { test, expect } from '../fixtures/base';
import { ProfilePage } from '../pages/profile.page';

/**
 * S2-001 — Profil utilisateur enrichi (culture, langue, préférences).
 *
 * The section is gated server-side by GET /api/profile (requireAuth +
 * isFeatureEnabled('rich_profile')), independent of the client-side
 * useAuth() hook — this app's e2e environment never configures Supabase
 * (see .github/workflows/ci.yml), so `useAuth()` always resolves to a
 * guest/null user. Mocking the API route directly (same pattern as
 * mockVideoCapsuleCreate) lets this flow be tested without a real session.
 */
test.describe('Rich profile section (S2-001)', () => {
  test('fills in culture, interface language and preferences, then saves', async ({
    page,
    mockApi,
  }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await mockApi.mockRichProfile({ culture: 'ma-fr', uiLanguage: 'fr-FR', preferences: {} });

    const profile = new ProfilePage(page);
    await profile.goto();

    await expect(profile.richProfileSection).toBeVisible();

    await profile.pickSelectOption(profile.cultureSelect, 'culture-option-ma-ar');
    await expect(profile.cultureSelect).toContainText('Arabe marocain');

    await profile.pickSelectOption(profile.uiLanguageSelect, 'ui-language-option-en-US');
    await expect(profile.uiLanguageSelect).toContainText('English');

    await profile.pickSelectOption(profile.paceSelect, 'pace-option-fast');
    await expect(profile.paceSelect).toContainText('Soutenu');

    await profile.humorCheckbox.click();
    await expect(profile.humorCheckbox).toHaveAttribute('data-state', 'checked');

    let patchBody: unknown;
    page.on('request', (req) => {
      if (req.url().includes('/api/profile') && req.method() === 'PATCH') {
        patchBody = req.postDataJSON();
      }
    });

    await profile.save();

    await expect(page.getByText('Profil enregistré')).toBeVisible();
    expect(patchBody).toMatchObject({
      culture: 'ma-ar',
      uiLanguage: 'en-US',
      preferences: { pace: 'fast', humorOk: true },
    });
  });

  test('section is absent when the rich_profile feature flag is disabled', async ({
    page,
    mockApi,
  }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await mockApi.mockRichProfileDisabled();

    const profile = new ProfilePage(page);
    await profile.goto();

    await expect(profile.richProfileSection).not.toBeVisible();
  });

  const LOCALE_CASES: { locale: 'fr-FR' | 'en-US' | 'ar-MA'; dir: 'ltr' | 'rtl'; label: string }[] =
    [
      { locale: 'fr-FR', dir: 'ltr', label: 'Référence culturelle' },
      { locale: 'en-US', dir: 'ltr', label: 'Cultural reference' },
      { locale: 'ar-MA', dir: 'rtl', label: 'المرجعية الثقافية' },
    ];

  for (const { locale, dir, label } of LOCALE_CASES) {
    test(`renders localized labels in ${locale} (dir=${dir})`, async ({ page, mockApi }) => {
      await page.addInitScript((loc) => localStorage.setItem('locale', loc), locale);
      await mockApi.mockRichProfile();

      const profile = new ProfilePage(page);
      await profile.goto();

      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);

      await expect(profile.richProfileSection).toBeVisible();
      await expect(page.getByText(label)).toBeVisible();
    });
  }
});
