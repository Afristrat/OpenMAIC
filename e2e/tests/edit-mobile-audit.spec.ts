import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/base';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const SETTINGS_STORAGE = createSettingsStorage({ sidebarCollapsed: false });

async function seedScene(page: Page, stageId: string, scene: Record<string, unknown>) {
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
  }, SETTINGS_STORAGE);
  await page.goto('/app', { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ id, seededScene }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('MAIC-Database');
        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
          const now = Date.now();
          tx.objectStore('stages').put({
            id,
            name: 'Mobile audit',
            description: '',
            language: 'en-US',
            style: 'professional',
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('scenes').put({
            ...seededScene,
            stageId: id,
            order: 0,
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('stageOutlines').put({
            stageId: id,
            outlines: [],
            createdAt: now,
            updatedAt: now,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    { id: stageId, seededScene: scene },
  );
}

async function enterProMode(page: Page, stageId: string) {
  const classroom = new ClassroomPage(page);
  await classroom.goto(stageId);
  await classroom.waitForLoaded();
  await page.getByRole('switch').click();
  await expect(page.getByTestId('slide-nav-rail')).toBeVisible({ timeout: 10_000 });
}

test.describe('Mobile Pro editor audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test('keeps the canvas usable, drawers exclusive, and timeline tappable', async ({ page }) => {
    const stageId = 'e2e-mobile-slide';
    await seedScene(page, stageId, {
      id: 'scene-slide',
      type: 'slide',
      title: 'Mobile slide',
      content: {
        type: 'slide',
        canvas: {
          id: 'mobile-canvas',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: {
            backgroundColor: '#ffffff',
            themeColors: ['#5b8def', '#8b5cf6', '#10b981', '#f59e0b'],
            fontColor: '#111827',
            fontName: 'Inter',
          },
          background: { type: 'solid', color: '#ffffff' },
          elements: [
            {
              id: 'mobile-text',
              type: 'text',
              content: 'Tap to format',
              left: 100,
              top: 100,
              width: 800,
              height: 120,
            },
            {
              id: 'mobile-text-2',
              type: 'text',
              content: 'Overlapping content',
              left: 120,
              top: 110,
              width: 700,
              height: 120,
            },
          ],
        },
      },
      actions: [],
    });
    await enterProMode(page, stageId);

    const nav = page.getByTestId('slide-nav-rail');
    const agent = page.getByTestId('agent-panel');
    await expect(nav).toHaveAttribute('data-mobile-open', 'false');
    await expect(agent).toHaveAttribute('data-mobile-open', 'false');
    await expect(nav).toContainText('Scenes');
    await expect(agent).toContainText('AI assistant');

    const undo = page.locator('button[aria-label="Undo"]');
    await expect(undo).toBeVisible();
    await expect(undo).toContainText('Undo');
    expect((await undo.boundingBox())?.height).toBeGreaterThanOrEqual(44);

    const editableText = page.locator('.editable-element-text').last();
    await expect(editableText).toBeVisible();
    const canvasWidth = await editableText.evaluate(
      (element) => element.closest('[style*="grid-area: center"]')?.getBoundingClientRect().width,
    );
    // 375 px is the complete CSS viewport in headless Chromium at 390 px
    // (the remaining 15 px are its scrollbar), so neither rail consumes it.
    expect(canvasWidth).toBeGreaterThanOrEqual(370);

    await editableText.click();
    const formatBar = page.getByTestId('text-format-bar');
    await expect(formatBar).toBeVisible();
    const formatViewport = formatBar.locator('..');
    expect(
      await formatViewport.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);
    expect((await formatViewport.boundingBox())?.width).toBeLessThanOrEqual(359);

    const secondText = page.locator('.editable-element-text').nth(1);
    const beforeRepair = await secondText.boundingBox();
    await page.getByTestId('resolve-slide-overlaps').click();
    const afterRepair = await secondText.boundingBox();
    expect(afterRepair?.x !== beforeRepair?.x || afterRepair?.y !== beforeRepair?.y).toBeTruthy();

    await nav.getByRole('button').first().click();
    await expect(nav).toHaveAttribute('data-mobile-open', 'true');
    await agent.click();
    await expect(agent).toHaveAttribute('data-mobile-open', 'true');
    await expect(nav).toHaveAttribute('data-mobile-open', 'false');
    const promptStarter = agent.getByRole('button', {
      name: 'Condense this slide to 3 points.',
    });
    await promptStarter.click();
    await expect(agent.locator('textarea')).toHaveValue('Condense this slide to 3 points.');
    await agent.locator('button:has(.lucide-panel-right-close)').click();
    await expect(agent).toHaveAttribute('data-mobile-open', 'false');

    await undo.click();
    const afterUndo = await secondText.boundingBox();
    expect(afterUndo?.x).toBeCloseTo(beforeRepair?.x ?? 0, 0);
    expect(afterUndo?.y).toBeCloseTo(beforeRepair?.y ?? 0, 0);

    const actionsBar = page.getByTestId('actions-bar');
    const speechPaletteButton = actionsBar.locator('button[draggable="true"]').first();
    await expect(speechPaletteButton).toBeVisible();
    await speechPaletteButton.click();
    await expect(actionsBar.locator('textarea')).toHaveCount(1);
  });

  test('offers no projector or laser cue on a quiz without a canvas picker', async ({ page }) => {
    const stageId = 'e2e-mobile-quiz';
    await seedScene(page, stageId, {
      id: 'scene-quiz',
      type: 'quiz',
      title: 'Mobile quiz',
      content: {
        type: 'quiz',
        questions: [
          {
            id: 'mobile-question',
            type: 'single',
            question: 'Ready?',
            options: [
              { label: 'Yes', value: 'A' },
              { label: 'No', value: 'B' },
            ],
            answer: ['A'],
            points: 1,
          },
        ],
      },
      actions: [],
    });
    await enterProMode(page, stageId);

    const actionsBar = page.getByTestId('actions-bar');
    await expect(actionsBar.locator('button[draggable="true"]')).toHaveCount(1);
    await expect(actionsBar.locator('.lucide-focus')).toHaveCount(0);
    await expect(actionsBar.locator('.lucide-crosshair')).toHaveCount(0);

    const question = page.getByTestId('quiz-question');
    await expect(question).toBeVisible();
    for (const button of await question.getByRole('button').all()) {
      const box = await button.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
