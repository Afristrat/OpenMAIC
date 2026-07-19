import { describe, it, expect, vi } from 'vitest';
import { runCapture } from './capture.js';

vi.mock('playwright', () => {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue('Example Domain'),
    mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
    click: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    video: vi.fn().mockReturnValue(undefined),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { chromium: { launch: vi.fn().mockResolvedValue(browser) } };
});

describe('runCapture', () => {
  it('returns a PNG buffer for format:image', async () => {
    const result = await runCapture({
      url: 'https://example.com',
      interactionSteps: [{ action: 'wait', ms: 100 }],
      format: 'image',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.contentType).toBe('image/png');
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it('returns success:false when goto throws (page unreachable)', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    vi.mocked(page.goto).mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));

    const result = await runCapture({
      url: 'https://unreachable.invalid',
      interactionSteps: [],
      format: 'image',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('ERR_NAME_NOT_RESOLVED');
    }
  });
});
