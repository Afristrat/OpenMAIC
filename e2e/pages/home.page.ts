import type { Page, Locator } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly logo: Locator;
  readonly textarea: Locator;
  readonly enterButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logo = page.getByTestId('app-logo');
    this.textarea = page.locator('textarea');
    // Matches the submit button's label across all supported locales
    // (t('toolbar.enterClassroom')): en, zh, fr-FR, ar-MA.
    this.enterButton = page.getByRole('button', {
      name: /enter classroom|进入课堂|accéder à la classe virtuelle|دخول الفصل/i,
    });
  }

  async goto() {
    await this.page.goto('/app');
  }

  async fillRequirement(text: string) {
    await this.textarea.fill(text);
  }

  async configureAnimation(
    approach: 'pedagogy' | 'hybrid' | 'andragogy' = 'andragogy',
    level: 'guided' | 'balanced' | 'immersive' = 'balanced',
  ) {
    await this.page.getByTestId(`learning-approach-${approach}`).click();
    await this.page.getByTestId(`interaction-level-${level}`).click();
  }

  /** Le sélecteur de métier ESCO, exigé avant tout plan. */
  get competencyFramework(): Locator {
    return this.page.getByTestId('competency-framework');
  }

  /** Simule le référentiel puis choisit un métier : ses compétences essentielles sont retenues d'emblée. */
  async chooseCompetencyFramework() {
    const occupationId = '11111111-1111-4111-8111-111111111111';
    const uri = `http://data.europa.eu/esco/occupation/${occupationId}`;
    const titles = { fr: 'développeur web', ar: null, en: 'web developer' };
    await this.page.route('**/api/referentiel/occupations?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          occupations: [
            {
              id: occupationId,
              uri,
              titles,
              iscoCode: '2513',
              essentialCount: 2,
              optionalCount: 1,
            },
          ],
        }),
      }),
    );
    await this.page.route(`**/api/referentiel/occupations/${occupationId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          occupation: { id: occupationId, uri, titles, iscoCode: '2513' },
          essential: [
            {
              uri: 'http://data.europa.eu/esco/skill/a',
              titles: { fr: 'concevoir une interface', ar: null, en: 'design an interface' },
            },
            {
              uri: 'http://data.europa.eu/esco/skill/b',
              titles: { fr: 'tester en continu', ar: null, en: 'test continuously' },
            },
          ],
          optional: [
            {
              uri: 'http://data.europa.eu/esco/skill/c',
              titles: { fr: 'documenter', ar: null, en: 'document' },
            },
          ],
        }),
      }),
    );
    await this.competencyFramework.getByRole('searchbox').fill('dév');
    await this.competencyFramework
      .getByRole('button', { name: /développeur web|web developer/i })
      .click();
    await this.competencyFramework.getByRole('checkbox').first().waitFor();
  }

  async submit() {
    // Sans métier choisi, le plan est refusé : on le choisit d'abord, sauf si c'est déjà fait.
    if (await this.competencyFramework.getByRole('searchbox').count()) {
      await this.chooseCompetencyFramework();
    }
    await this.enterButton.click();
  }
}
