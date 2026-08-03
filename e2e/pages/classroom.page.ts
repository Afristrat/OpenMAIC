import type { Page, Locator } from '@playwright/test';

export class ClassroomPage {
  readonly page: Page;
  readonly loadingText: Locator;
  readonly sidebarScenes: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loadingText = page.getByText('Loading classroom...');
    this.sidebarScenes = page.locator('[data-testid="scene-item"]');
  }

  async goto(stageId: string) {
    // E2E classrooms seeded in IndexedDB are intentionally local-only. Make
    // that boundary explicit so the production editor gate sees a 404 rather
    // than a fake Supabase 500 and can safely enable local editing.
    await this.page.route('**/api/classroom?*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Local E2E classroom' }),
        });
        return;
      }
      await route.continue();
    });
    await this.page.goto(`/classroom/${stageId}`);
  }

  async waitForLoaded() {
    await this.loadingText.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  async clickScene(index: number) {
    await this.sidebarScenes.nth(index).click();
  }

  /** Get scene title — it's the second span (first is the number badge) */
  getSceneTitle(index: number) {
    return this.sidebarScenes.nth(index).locator('[data-testid="scene-title"]');
  }
}
