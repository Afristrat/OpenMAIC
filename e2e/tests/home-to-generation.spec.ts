import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { mockOutlines } from '../fixtures/test-data/scene-outlines';
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
    await expect(page.getByTestId('generation-selection-requirement')).toContainText(
      'Choose the learning approach and interaction level.',
    );
    await expect(home.enterButton).toBeDisabled();
    await home.configureAnimation();
    await expect(page.getByTestId('generation-selection-requirement')).toHaveCount(0);
    await expect(home.enterButton).toBeEnabled();

    // Submit → navigate to generation-preview
    await home.submit();
    await expect(page.getByTestId('syllabus-workspace')).toBeVisible();
    await expect(page.getByTestId('syllabus-brief-panel')).toBeVisible();
    await expect(page.getByTestId('syllabus-sequence-panel')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);

    const [workspaceBox, briefBox, sequenceBox] = await Promise.all([
      page.getByTestId('syllabus-workspace').boundingBox(),
      page.getByTestId('syllabus-brief-panel').boundingBox(),
      page.getByTestId('syllabus-sequence-panel').boundingBox(),
    ]);
    expect(workspaceBox).not.toBeNull();
    expect(briefBox).not.toBeNull();
    expect(sequenceBox).not.toBeNull();
    expect(workspaceBox!.width).toBeGreaterThan(700);
    expect(sequenceBox!.y).toBeGreaterThan(briefBox!.y);
    await expect(page.getByRole('heading', { name: 'Training plan' })).toBeVisible();
    await expect(page.getByText('Approach : Build on experience', { exact: true })).toBeVisible();
    await expect(page.getByText('Interaction : Balanced', { exact: true })).toBeVisible();
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

  test('turns the syllabus workspace into one readable mobile flow', async ({ page, mockApi }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi.mockClassroomGenerationJob('e2e-mobile-syllabus-job');
    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Create a practical course for store managers');
    await home.configureAnimation();
    await home.submit();

    const briefPanel = page.getByTestId('syllabus-brief-panel');
    const sequencePanel = page.getByTestId('syllabus-sequence-panel');
    await expect(briefPanel).toBeVisible();
    await expect(sequencePanel).toBeVisible();

    const [briefBox, sequenceBox, viewport] = await Promise.all([
      briefPanel.boundingBox(),
      sequencePanel.boundingBox(),
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
      })),
    ]);
    expect(briefBox).not.toBeNull();
    expect(sequenceBox).not.toBeNull();
    expect(sequenceBox!.y).toBeGreaterThan(briefBox!.y);
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
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

  test('blocks a contradictory attachment before showing a syllabus', async ({
    page,
    mockApi,
  }) => {
    const acceptedJob = await mockApi.mockClassroomGenerationJob('source-reformulation-e2e');
    await page.route('**/api/parse-pdf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            text: 'Process improvement, Lean Six Sigma and continuous improvement.',
            images: [],
          },
        }),
      });
    });
    let planRequests = 0;
    await page.route('**/api/generate-classroom/plan', async (route) => {
      planRequests += 1;
      if (planRequests > 1) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'plan-conflict-e2e',
          pollIntervalMs: 10,
        }),
      });
    });
    await page.route('**/api/generate-classroom/plan/plan-conflict-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'failed',
          done: true,
          errorCode: 'SOURCE_MATERIAL_CONFLICT',
          error: 'The request and attached document do not match.',
          sourceAlignment: {
            status: 'conflicting',
            requestTopic: 'Time management',
            sourceTopic: 'Process improvement',
            explanation: 'The request and source cover different primary topics.',
            suggestedRequirement:
              'Create five practical slides about Lean Six Sigma and continuous improvement.',
            references: ['Process improvement, Lean Six Sigma and continuous improvement.'],
          },
        }),
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Create five slides about time management.');
    await home.configureAnimation();
    await page.getByRole('button', { name: 'Upload PDF' }).click();
    await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles({
      name: 'process-improvement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e'),
    });
    await home.submit();

    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'The request and document conflict' }),
    ).toBeVisible();
    await expect(page.getByText('Time management', { exact: true })).toBeVisible();
    await expect(page.getByText('Process improvement', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Process improvement, Lean Six Sigma and continuous improvement.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Training plan' })).not.toBeVisible();

    const suggestion = page.getByLabel('Suggested reformulation');
    await suggestion.fill(
      'Create five practical slides about Lean Six Sigma, Kaizen and continuous improvement.',
    );
    await page.getByRole('button', { name: 'Use this reformulation' }).click();
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    await expect(home.textarea).toHaveValue(
      'Create five practical slides about Lean Six Sigma, Kaizen and continuous improvement.',
    );
    await expect(page.getByText('process-improvement.pdf')).toBeVisible();

    await home.submit();
    await expect(page.getByRole('heading', { name: 'Training plan' })).toBeVisible();
    expect(acceptedJob.getPlanRequestBody()).toMatchObject({
      requirement:
        'Create five practical slides about Lean Six Sigma, Kaizen and continuous improvement.',
    });
  });

  test('localizes the source-conflict decision in French, Arabic and English', async ({ page }) => {
    await page.route('**/api/parse-pdf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { text: 'Lean Six Sigma and continuous improvement.', images: [] },
        }),
      });
    });
    await page.route('**/api/generate-classroom/plan', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, jobId: 'localized-conflict', pollIntervalMs: 10 }),
      });
    });
    await page.route('**/api/generate-classroom/plan/localized-conflict', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'failed',
          done: true,
          errorCode: 'SOURCE_MATERIAL_CONFLICT',
          sourceAlignment: {
            status: 'conflicting',
            requestTopic: 'Time management',
            sourceTopic: 'Process improvement',
            explanation: 'The request and source cover different primary topics.',
            suggestedRequirement: 'Create a course about Lean Six Sigma.',
            references: ['Lean Six Sigma and continuous improvement.'],
          },
        }),
      });
    });

    const cases = [
      {
        locale: 'fr-FR',
        dir: 'ltr',
        suggestion: 'Reformulation proposée',
        accept: 'Utiliser cette reformulation',
        review: 'Refuser et revoir ma demande',
      },
      {
        locale: 'ar-MA',
        dir: 'rtl',
        suggestion: 'إعادة الصياغة المقترحة',
        accept: 'استخدام إعادة الصياغة هذه',
        review: 'رفض الاقتراح ومراجعة طلبي',
      },
      {
        locale: 'en-US',
        dir: 'ltr',
        suggestion: 'Suggested reformulation',
        accept: 'Use this reformulation',
        review: 'Reject and review my request',
      },
    ] as const;

    const home = new HomePage(page);
    for (const localized of cases) {
      await home.goto();
      await page.evaluate((locale) => localStorage.setItem('locale', locale), localized.locale);
      await page.reload();
      await home.fillRequirement('Create five slides about time management.');
      await home.configureAnimation();
      await page.getByRole('button', { name: /PDF/ }).click();
      await page.locator('input[type="file"][accept*=".pdf"]').setInputFiles({
        name: 'source.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 e2e'),
      });
      await home.submit();

      await expect(page.locator('html')).toHaveAttribute('lang', localized.locale);
      await expect(page.locator('html')).toHaveAttribute('dir', localized.dir);
      await expect(page.getByLabel(localized.suggestion)).toBeVisible();
      await expect(page.getByRole('button', { name: localized.accept })).toBeVisible();
      await page.getByRole('button', { name: localized.review }).click();
      await expect(page.getByRole('alertdialog')).not.toBeVisible();
    }
  });

  test('keeps an asynchronous plan recoverable when its status endpoint returns HTML', async ({
    page,
  }) => {
    await page.route('**/api/generate-classroom/plan', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'plan-recoverable-e2e',
          pollIntervalMs: 10,
        }),
      });
    });
    await page.route('**/api/generate-classroom/plan/plan-recoverable-e2e', async (route) => {
      await route.fulfill({
        status: 504,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body>Gateway Time-out</body></html>',
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Create five practical slides about process improvement.');
    await home.configureAnimation('andragogy', 'immersive');
    await home.submit();

    await expect(page).toHaveURL(/planJobId=plan-recoverable-e2e/);
    await expect(page.getByText(/Unexpected token/)).not.toBeVisible();
  });

  test('resumes a completed syllabus after a page refresh without resubmitting it', async ({
    page,
  }) => {
    let submissions = 0;
    await page.route('**/api/generate-classroom/plan', async (route) => {
      submissions += 1;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'plan-refresh-e2e',
          pollIntervalMs: 60_000,
        }),
      });
    });
    await page.route('**/api/generate-classroom/plan/plan-refresh-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'succeeded',
          done: true,
          generationRequest: {
            orgId: 'e2e-org',
            requirement: 'Persistent syllabus',
            learningApproach: 'andragogy',
            interactionLevel: 'balanced',
          },
          result: {
            courseTitle: 'Recovered syllabus',
            languageDirective: 'Teach in English.',
            syllabus: {
              audience: 'Operations managers',
              prerequisites: 'None',
              overallObjective: 'Improve one process',
              learningObjectives: ['Diagnose one bottleneck'],
              totalDurationMinutes: 30,
              deliveryMode: 'Virtual classroom',
              assessmentStrategy: 'Observed exercise',
              expectedDeliverable: 'Improvement plan',
            },
            outlines: mockOutlines,
          },
        }),
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.fillRequirement('Create a persistent process improvement syllabus.');
    await home.configureAnimation('andragogy', 'balanced');
    await home.submit();
    await expect(page).toHaveURL(/planJobId=plan-refresh-e2e/);
    await page.reload();

    await expect(page.getByLabel('Course title')).toHaveValue('Recovered syllabus');
    expect(submissions).toBe(1);
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
