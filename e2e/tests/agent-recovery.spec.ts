import { test, expect } from '../fixtures/base';
import fr from '../../lib/i18n/locales/ui-fr-FR.json';
import ar from '../../lib/i18n/locales/ui-ar-MA.json';
import en from '../../lib/i18n/locales/ui-en-US.json';
const orgId = '00000000-0000-4000-8000-000000000002';
for (const [locale, labels] of Object.entries({ 'fr-FR': fr, 'ar-MA': ar, 'en-US': en })) {
  test(`reprise privée explicite avec accusé exact — ${locale}`, async ({ page }) => {
    await page.addInitScript((locale) => localStorage.setItem('locale', locale), locale);
    let confirmed = false;
    let recovered = false;
    let publicationWrites = 0;
    await page.route('**/api/marketplace/agents?*', (route) =>
      route.fulfill({
        json: {
          success: true,
          agents: [],
          pagination: { page: 1, total: 0, totalPages: 0, limit: 20 },
        },
      }),
    );
    await page.route('**/api/marketplace/agents', (route) => {
      if (route.request().method() === 'POST') publicationWrites++;
      return route.fulfill({
        json: {
          success: true,
          agents: [],
          pagination: { page: 1, total: 0, totalPages: 0, limit: 20 },
        },
      });
    });
    await page.route('**/api/marketplace/agents/owned?*', (route) =>
      route.fulfill({
        json: {
          success: true,
          agents: recovered
            ? [{ id: 'recoverable-agent', name: 'Agent conservé', orgId, published: false }]
            : [],
          pagination: { totalPages: recovered ? 1 : 0 },
        },
      }),
    );
    await page.route('**/api/marketplace/agents/recoverable?*', (route) => {
      expect(new URL(route.request().url()).searchParams.get('orgId')).toBe(orgId);
      return route.fulfill({
        json: {
          success: true,
          agents: [{ id: 'recoverable-agent', name: 'Agent conservé' }],
          nextCursor: null,
        },
      });
    });
    await page.route('**/api/marketplace/agents/recoverable', (route) => {
      expect(route.request().postDataJSON()).toEqual({ orgId, agentId: 'recoverable-agent' });
      recovered = confirmed;
      return route.fulfill({
        json: confirmed
          ? { success: true, reclaimed: true, agentId: 'recoverable-agent' }
          : { success: true },
      });
    });
    await page.goto('/marketplace/agents');
    const select = page.getByRole('combobox', { name: labels['marketplace.publicationOrg'] });
    await expect(select).toBeEnabled();
    await select.selectOption(orgId);
    const section = page.getByRole('region', { name: labels['marketplace.recoverableTitle'] });
    await section.getByRole('button', { name: labels['catalog.loadOrphaned'] }).click();
    await expect(section.getByText('Agent conservé')).toBeVisible();
    await section.getByRole('button', { name: labels['catalog.reclaim'], exact: true }).click();
    await expect(section.getByRole('alert')).toBeVisible();
    await expect(section.getByText('Agent conservé')).toBeVisible();
    confirmed = true;
    await section.getByRole('button', { name: labels['catalog.reclaim'], exact: true }).click();
    await expect(section.getByText('Agent conservé')).toHaveCount(0);
    const owned = page.getByRole('region', { name: labels['marketplace.ownedTitle'] });
    await expect(
      owned.getByText(`Agent conservé — ${labels['marketplace.privateAgent']}`),
    ).toBeVisible();
    expect(publicationWrites).toBe(0);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
  });
}
