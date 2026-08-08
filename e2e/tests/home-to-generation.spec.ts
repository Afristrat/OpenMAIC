import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import type { Page } from '@playwright/test';

// Inject settings with modelId so the "enter classroom" button works
const SETTINGS_STORAGE = createSettingsStorage();

interface BodySpacing {
  paddingRight: string;
  marginRight: string;
}

async function readBodySpacing(page: Page): Promise<BodySpacing> {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.body);
    return {
      paddingRight: styles.paddingRight,
      marginRight: styles.marginRight,
    };
  });
}

async function expectBodyScrollState(page: Page, initialSpacing: BodySpacing, locked: boolean) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        locked: document.body.hasAttribute('data-scroll-locked'),
        paddingRight: getComputedStyle(document.body).paddingRight,
        marginRight: getComputedStyle(document.body).marginRight,
      })),
    )
    .toEqual({
      locked,
      paddingRight: initialSpacing.paddingRight,
      marginRight: initialSpacing.marginRight,
    });
}

test.describe('Home → Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'en-US');
    }, SETTINGS_STORAGE);
  });

  test('home page loads with core UI elements and submits a persistent job', async ({
    page,
    mockApi,
  }) => {
    const generationJob = await mockApi.mockClassroomGenerationJob();
    const home = new HomePage(page);
    await home.goto();

    // Core elements visible
    await expect(home.logo).toBeVisible();
    await expect(home.textarea).toBeVisible();
    await expect(home.enterButton).toBeDisabled();

    // Type requirement → button activates
    await home.fillRequirement('讲解光合作用');
    await home.configureAnimation();
    await expect(home.enterButton).toBeEnabled();

    // Submit → navigate to generation-preview
    await home.submit();
    await expect(page.getByRole('heading', { name: 'Training plan' })).toBeVisible();
    await expect(page.getByLabel('Course title')).toHaveValue('E2E approved plan');
    await expect(page.getByLabel('Audience')).toHaveValue('Store managers');
    await expect(page.getByLabel('Overall objective')).toHaveValue('Prevent till discrepancies');
    await expect(page.getByLabel('Total duration in minutes')).toHaveValue('45');
    await page.getByLabel('Course title').fill('Editable E2E syllabus');
    await page.getByLabel('Audience').fill('Retail team leaders');
    await expect(page.getByRole('button', { name: 'Move scene 2 up' })).toBeVisible();
    expect(generationJob.getSubmittedBody()).toBeUndefined();
    await page.getByRole('button', { name: 'Confirm and generate course' }).click();
    await expect(page).toHaveURL(/\/generation-status\?jobId=e2e-generation-job$/);
    await expect(page.getByRole('heading', { name: 'Generating course' })).toBeVisible();
    expect(generationJob.getSubmittedBody()).toMatchObject({
      agentMode: 'default',
      approvedPlan: {
        courseTitle: 'Editable E2E syllabus',
        syllabus: { audience: 'Retail team leaders' },
      },
    });
  });

  test('sends the selected PDF parser and preserves extracted text in the plan request', async ({
    page,
    mockApi,
  }) => {
    await page.addInitScript(() => {
      const stored = JSON.parse(localStorage.getItem('settings-storage') ?? '{}');
      stored.state.pdfProviderId = 'mineru';
      stored.state.pdfProvidersConfig = {
        unpdf: { apiKey: '', baseUrl: '', enabled: true },
        mineru: {
          apiKey: 'e2e-mineru-key',
          baseUrl: 'https://mineru.e2e.test/v1',
          enabled: true,
        },
        'mineru-cloud': { apiKey: '', baseUrl: '', enabled: false },
      };
      localStorage.setItem('settings-storage', JSON.stringify(stored));
    });
    let multipartBody = '';
    await page.route('**/api/parse-pdf', async (route) => {
      multipartBody = route.request().postDataBuffer()?.toString('utf8') ?? '';
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: { text: 'Source PDF validée', images: [], metadata: { pageCount: 1 } },
        }),
      });
    });
    const generationJob = await mockApi.mockClassroomGenerationJob('e2e-pdf-job');
    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Create a course from this source');
    await home.configureAnimation();
    await page.getByRole('button', { name: 'Upload PDF' }).click();
    await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles({
      name: 'source.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e'),
    });
    await home.submit();

    await expect(page.getByRole('heading', { name: 'Training plan' })).toBeVisible();
    expect(multipartBody).toContain('mineru');
    expect(multipartBody).toContain('https://mineru.e2e.test/v1');
    expect(generationJob.getPlanRequestBody()).toMatchObject({
      pdfContent: { text: 'Source PDF validée', images: [] },
    });
  });

  test('keeps body spacing stable when the settings dialog opens', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.logo).toBeVisible();

    const initialBodySpacing = await readBodySpacing(page);

    await page.locator('button:has(svg.lucide-settings)').first().click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expectBodyScrollState(page, initialBodySpacing, true);
  });
});
