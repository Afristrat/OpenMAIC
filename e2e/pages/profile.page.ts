import type { Page, Locator } from '@playwright/test';

/** Page Object for `/profile` — rich profile section (culture, langue, préférences — S2-001) */
export class ProfilePage {
  readonly page: Page;
  readonly richProfileSection: Locator;
  readonly cultureSelect: Locator;
  readonly uiLanguageSelect: Locator;
  readonly paceSelect: Locator;
  readonly humorCheckbox: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.richProfileSection = page.getByTestId('rich-profile-section');
    this.cultureSelect = page.getByTestId('culture-select');
    this.uiLanguageSelect = page.getByTestId('ui-language-select');
    this.paceSelect = page.getByTestId('pace-select');
    this.humorCheckbox = page.getByTestId('humor-checkbox');
    this.saveButton = page.getByTestId('rich-profile-save');
  }

  async goto() {
    await this.page.goto('/profile');
  }

  /** Opens a Radix Select and picks the option rendered with this data-testid. */
  async pickSelectOption(trigger: Locator, optionTestId: string) {
    await trigger.click();
    await this.page.getByTestId(optionTestId).click();
  }

  async save() {
    await this.saveButton.click();
  }
}
