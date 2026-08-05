import { expect, test } from '../fixtures/base';

test.describe('Créateur guidé d’expertises', () => {
  test('un auteur crée une expertise sans écrire de manifeste JSON', async ({ page }) => {
    let submittedManifest: Record<string, unknown> | undefined;
    let created = false;

    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.route('**/api/skills?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          skills: created
            ? [
                {
                  id: 'pilotage-tresorerie-tpe',
                  name: 'Pilotage trésorerie TPE',
                  description: 'Anticiper une tension de trésorerie.',
                  category: 'domain',
                  version: '1.0.0',
                  author: 'Qalem E2E',
                  supportedLanguages: ['fr-FR'],
                  agentCount: 0,
                  templateCount: 1,
                  agents: [],
                  templates: [],
                  source: 'organization',
                },
              ]
            : [],
        }),
      });
    });
    await page.route('**/api/skills', async (route) => {
      const body = route.request().postDataJSON() as {
        manifest?: Record<string, unknown>;
      };
      submittedManifest = body.manifest;
      created = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, skillId: 'pilotage-tresorerie-tpe' }),
      });
    });

    await page.goto('/skills');
    await page.getByRole('button', { name: 'Créer une expertise' }).click();
    await page.getByLabel('Nom de l’expertise').fill('Pilotage trésorerie TPE');
    await page.getByLabel('Promesse pédagogique').fill('Anticiper une tension de trésorerie.');
    await page
      .getByLabel('Règles et savoir métier')
      .fill('Distinguer résultat, trésorerie et besoin en fonds de roulement.');
    await page
      .getByLabel('Demande de formation prête à utiliser')
      .fill('Créez un atelier de 45 minutes sur la trésorerie d’une TPE.');
    await page.getByRole('button', { name: 'Créer et activer' }).click();

    await expect(page.getByText('Pilotage trésorerie TPE')).toBeVisible();
    expect(submittedManifest?.id).toBe('pilotage-tresorerie-tpe');
    expect(submittedManifest?.promptOverrides).toHaveLength(5);
    expect(submittedManifest?.classroomTemplates).toHaveLength(1);

    await page
      .getByTestId('skill-card-pilotage-tresorerie-tpe')
      .getByRole('button', { name: 'Utiliser l’expertise' })
      .click();
    await expect(page).toHaveURL(/\/app\?skill=pilotage-tresorerie-tpe$/);
    await expect(page.getByTestId('active-skill-indicator')).toContainText(
      'Pilotage trésorerie TPE',
    );
  });
});
