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

  async submit() {
    await this.enterButton.click();
  }
}
