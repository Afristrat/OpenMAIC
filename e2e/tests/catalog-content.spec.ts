import { test, expect } from '../fixtures/base';

test.describe('System learning catalogs', () => {
  test('shows the six system blueprints on the generation page', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto('/app', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Trames' }).click();
    await expect(page.getByRole('heading', { name: 'Méthode de conception' })).toBeVisible();
    const performanceBlueprint = page.getByRole('button', {
      name: /Réussir une performance professionnelle/,
    });
    await expect(performanceBlueprint).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Prendre une décision argumentée/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Rappel opérationnel court/ })).toBeVisible();
    await performanceBlueprint.click();
    await expect(page.locator('textarea').first()).toHaveValue(
      /Commencez par la situation professionnelle à réussir/,
    );
  });

  test('serves and displays the ten canonical agents', async ({ page, request }) => {
    const response = await request.get('/api/marketplace/agents?limit=20');
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      agents: Array<{ id: string; name: string }>;
    };
    expect(payload.success).toBe(true);
    expect(payload.agents.filter((agent) => agent.id.startsWith('system-persona-'))).toHaveLength(
      10,
    );

    await page.goto('/marketplace/agents', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Younes', { exact: true })).toBeVisible();
    await expect(page.getByText('Hanae', { exact: true })).toBeVisible();
    await expect(page.getByText('Layla', { exact: true })).toBeVisible();
  });

  test('shows the verified ISCO-08 grounding before classroom generation', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    let specialistRequest: Record<string, unknown> | undefined;
    await page.route('**/api/generate/contextual-specialists', async (route) => {
      specialistRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          specialists: [
            {
              id: 'specialist-Ab12Cd34',
              name: 'Nadia',
              occupationTitle: 'comptable',
              iscoCode: '2411',
              escoUri: 'http://data.europa.eu/esco/occupation/accountant',
              reason: 'Relier les exercices aux décisions financières.',
              gender: 'female',
              avatar: '/avatars/assist.png',
              role: 'assistant',
              persona: 'Spécialiste fondée sur les tâches ISCO-08.',
              occupationalProfile: {
                standard: 'ISCO-08',
                unitGroupCode: '2411',
                unitGroupTitle: 'Cadres comptables',
                occupationDescription: 'Analyse les documents financiers.',
                tasks: [
                  'préparer et certifier les états financiers',
                  'préparer des prévisions et des budgets',
                ],
                sourceTasks: [
                  'prepare and certify financial statements',
                  'prepare forecasts and budgets',
                ],
                taskLocale: 'fr-FR',
                sourceVersion: 'v1.2.1',
                essentialSkills: ['analyser le risque financier'],
                knowledge: ['techniques comptables'],
                iscoUri: 'http://data.europa.eu/esco/isco/C2411',
                occupationUri: 'http://data.europa.eu/esco/occupation/accountant',
                sourceUrl: 'https://isco.ilo.org/en/isco-08/',
              },
              voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
            },
          ],
          reference: 'ISCO-08 via ESCO v1.2.1',
        }),
      });
    });

    await page.goto('/app', { waitUntil: 'networkidle' });
    await page.locator('textarea').first().fill('Former une équipe au pilotage de trésorerie.');
    await page.getByRole('button', { name: 'Prêt à apprendre ensemble ?' }).click();
    await page.getByRole('button', { name: 'Proposer des spécialistes du sujet' }).click();

    expect(specialistRequest).toMatchObject({ territory: 'Maroc', locale: 'fr-FR' });

    await expect(page.getByText('Nadia · comptable')).toBeVisible();
    await expect(page.getByText('ISCO-08 2411 · Cadres comptables')).toBeVisible();
    await expect(page.getByText(/préparer et certifier les états financiers/)).toBeVisible();
  });
});
