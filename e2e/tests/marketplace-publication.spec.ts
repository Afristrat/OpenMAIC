import { test, expect } from '../fixtures/base';
import fr from '../../lib/i18n/locales/ui-fr-FR.json';
import ar from '../../lib/i18n/locales/ui-ar-MA.json';
import en from '../../lib/i18n/locales/ui-en-US.json';

for (const [locale, labels] of Object.entries({ 'fr-FR': fr, 'ar-MA': ar, 'en-US': en })) {
test(`publishes and recovers the same snapshot (${locale})`, async ({ page }) => {
  const configuration = {
    name: 'Analyste de recette',
    role: 'student',
    persona: 'Analyse les situations.',
    avatar: '/avatars/teacher-2.png',
    color: '#112233',
    priority: 9,
    allowedActions: ['wb_open'],
    gender: 'female',
    interactionWeight: 37,
    voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
  };
  await page.addInitScript(({ agent, locale }) => {
    localStorage.setItem('locale', locale);
    localStorage.setItem(
      'agent-registry-storage',
      JSON.stringify({
        version: 11,
        state: {
          agents: {
            'local-agent': {
              ...agent,
              id: 'local-agent',
              isDefault: false,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      }),
    );
  }, { agent: configuration, locale });
  let saved = false;
  let draftCount = 0;
  let published = false;
  await page.route('**/api/marketplace/agents/owned?*', (route) =>
    route.fulfill({
      json: {
        success: true,
        agents: saved
          ? [
              {
                id: 'server-snapshot',
                orgId: '00000000-0000-4000-8000-000000000002',
                name: configuration.name,
                published,
              },
            ]
          : [],
        pagination: { totalPages: saved ? 1 : 0 },
      },
    }),
  );
  await page.route('**/api/marketplace/agents/drafts', async (route) => {
    draftCount++;
    const body = route.request().postDataJSON();
    expect(body.orgId).toBe('00000000-0000-4000-8000-000000000002');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.agent).toEqual(configuration);
    saved = true;
    await route.fulfill({ json: { success: true, agentId: 'server-snapshot', published: false } });
  });
  await page.route(/\/api\/marketplace\/agents(?:\?|$)/, async (route) => {
    if (route.request().method() === 'POST') {
      expect(saved).toBe(true);
      const body = route.request().postDataJSON();
      expect(body.agentId).toBe('server-snapshot');
      published = body.isPublished;
      return route.fulfill({ json: { success: true, agentId: 'server-snapshot', published } });
    }
    return route.fulfill({
      json: {
        success: true,
        agents: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    });
  });
  await page.goto('/marketplace/agents');
  if (locale === 'ar-MA') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page
    .getByRole('combobox', { name: labels['marketplace.publicationOrg'], exact: true })
    .selectOption('00000000-0000-4000-8000-000000000002');
  await page
    .getByRole('combobox', { name: labels['marketplace.localAgent'], exact: true })
    .selectOption('local-agent');
  expect(saved).toBe(false);
  await page.getByRole('button', { name: labels['marketplace.publish'], exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(labels['marketplace.publicDescription'], { exact: true })
    .fill('Analyse de situations professionnelles.');
  expect(saved).toBe(false);
  await dialog.getByRole('button', { name: labels['marketplace.submitPublish'] }).click();
  await expect(dialog).not.toBeVisible();
  const owned = page.getByRole('region', { name: labels['marketplace.ownedTitle'] });
  const publishedName = `Analyste de recette — ${labels['marketplace.published']}`;
  const privateName = `Analyste de recette — ${labels['marketplace.privateAgent']}`;
  await expect(owned.getByText(publishedName, { exact: true })).toBeVisible();
  await page.reload();
  await expect(owned.getByText(publishedName, { exact: true })).toBeVisible();
  await owned.getByRole('button', { name: labels['marketplace.withdraw'] }).click();
  await expect(owned.getByText(privateName, { exact: true })).toBeVisible();
  expect(published).toBe(false);
  await page.reload();
  await expect(owned.getByText(privateName, { exact: true })).toBeVisible();
  await owned.getByRole('button', { name: labels['marketplace.publish'], exact: true }).click();
  await expect(owned.getByText(publishedName, { exact: true })).toBeVisible();
  expect(draftCount).toBe(1);
});
}
