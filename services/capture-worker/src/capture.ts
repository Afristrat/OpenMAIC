import { chromium } from 'playwright';
import { resolveStorageStatePath } from './storage-state-registry.js';

export interface CaptureInteractionStep {
  action: 'click' | 'scroll' | 'wait';
  selector?: string;
  ms?: number;
}

export interface CaptureRequest {
  url: string;
  interactionSteps: CaptureInteractionStep[];
  format: 'image' | 'video';
}

export type CaptureResult =
  | { success: true; buffer: Buffer; contentType: string }
  | { success: false; error: string };

const LOGIN_WALL_TITLE_PATTERN = /login|sign in/i;

function captureTimeoutMs(): number {
  const configured = Number(process.env.CAPTURE_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 60_000;
  return Math.min(Math.max(configured, 10_000), 120_000);
}

async function runInteractionSteps(
  page: import('playwright').Page,
  steps: CaptureInteractionStep[],
): Promise<void> {
  for (const step of steps) {
    if (step.action === 'click' && step.selector) {
      await page.click(step.selector, { timeout: 5000 });
    } else if (step.action === 'scroll') {
      await page.mouse.wheel(0, 600);
    }
    if (step.ms) await page.waitForTimeout(step.ms);
  }
}

export async function runCapture(request: CaptureRequest): Promise<CaptureResult> {
  const browser = await chromium.launch();
  const deadline = setTimeout(
    () => void browser.close().catch(() => undefined),
    captureTimeoutMs(),
  );
  deadline.unref();
  try {
    const storageState = resolveStorageStatePath(request.url);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ...(storageState ? { storageState } : {}),
      ...(request.format === 'video'
        ? { recordVideo: { dir: '/tmp/capture-videos', size: { width: 1440, height: 900 } } }
        : {}),
    });
    const page = await context.newPage();

    try {
      await page.goto(request.url, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (err) {
      await context.close();
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }

    const title = await page.title();
    if (LOGIN_WALL_TITLE_PATTERN.test(title)) {
      await context.close();
      return { success: false, error: `Login wall detected (page title: "${title}")` };
    }

    await runInteractionSteps(page, request.interactionSteps);

    if (request.format === 'image') {
      const buffer = await page.screenshot();
      await context.close();
      return { success: true, buffer, contentType: 'image/png' };
    }

    const video = page.video();
    await context.close();
    if (!video) return { success: false, error: 'No video recorded' };
    const videoPath = await video.path();
    const { readFileSync } = await import('node:fs');
    return { success: true, buffer: readFileSync(videoPath), contentType: 'video/webm' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(deadline);
    await browser.close().catch(() => undefined);
  }
}
