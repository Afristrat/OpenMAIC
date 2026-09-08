import { test, expect } from '../fixtures/base';

test('publishes a private snapshot explicitly and withdraws it after reload', async ({ page }) => {
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
  await page.addInitScript((agent) => {
    localStorage.setItem('locale', 'fr-FR');
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
  }, configuration);
  let saved = false;
  let published = false;
  await page.route('**/api/marketplace/agents/owned?*', (route) =>
    route.fulfill({
      json: {
        success: true,
        agents: saved ? [{ id: 'server-snapshot', name: configuration.name, published }] : [],
        pagination: { totalPages: saved ? 1 : 0 },
      },
    }),
  );
  await page.route('**/api/marketplace/agents/drafts', async (route) => {
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
  await page
    .getByRole('combobox', { name: 'Organisation de publication', exact: true })
    .selectOption('00000000-0000-4000-8000-000000000002');
  await page
    .getByRole('combobox', { name: 'Agent local', exact: true })
    .selectOption('local-agent');
  expect(saved).toBe(false);
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Description publique', { exact: true })
    .fill('Analyse de situations professionnelles.');
  expect(saved).toBe(false);
  await dialog.getByRole('button', { name: 'Confirmer la publication' }).click();
  await expect(dialog).not.toBeVisible();
  const owned = page.getByRole('region', { name: 'Mes agents partagés' });
  await expect(owned.getByText('Analyste de recette — Publié', { exact: true })).toBeVisible();
  await page.reload();
  await expect(owned.getByText('Analyste de recette — Publié', { exact: true })).toBeVisible();
  await owned.getByRole('button', { name: 'Retirer de la marketplace' }).click();
  await expect(owned.getByText('Analyste de recette — Privé', { exact: true })).toBeVisible();
  expect(published).toBe(false);
});
