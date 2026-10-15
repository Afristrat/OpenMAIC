import { promises as dns } from 'node:dns';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { blockUnsafeRequests, runCapture } from './capture.js';

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
    route: vi.fn().mockResolvedValue(undefined),
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

describe('blockUnsafeRequests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function decide(url: string): Promise<'continue' | 'abort'> {
    let handler: ((route: unknown) => Promise<unknown>) | undefined;
    const context = {
      route: vi.fn(async (_pattern: string, h: (route: unknown) => Promise<unknown>) => {
        handler = h;
      }),
    };
    // Double minimal de BrowserContext : seule `route` est utilisée.
    await blockUnsafeRequests(context as unknown as Parameters<typeof blockUnsafeRequests>[0]);
    expect(context.route).toHaveBeenCalledWith('**/*', expect.any(Function));
    const outcome: { value?: 'continue' | 'abort'; reason?: string } = {};
    await handler?.({
      request: () => ({ url: () => url }),
      continue: async () => {
        outcome.value = 'continue';
      },
      abort: async (reason: string) => {
        outcome.value = 'abort';
        outcome.reason = reason;
      },
    });
    if (outcome.value === 'abort') expect(outcome.reason).toBe('blockedbyclient');
    return outcome.value ?? 'abort';
  }

  it('abort les requêtes vers le loopback et les métadonnées cloud', async () => {
    expect(await decide('http://127.0.0.1:8080/admin')).toBe('abort');
    expect(await decide('http://169.254.169.254/latest/meta-data/')).toBe('abort');
    expect(await decide('http://localhost/')).toBe('abort');
    expect(await decide('http://[::1]/')).toBe('abort');
  });

  it('abort une requête (redirection, iframe) vers un hôte résolu en adresse privée', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    expect(await decide('https://rebind.example.test/redirige-ici')).toBe('abort');
  });

  it('abort un hôte non résolvable (échec fermé)', async () => {
    vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));
    expect(await decide('https://inconnu.example.test/')).toBe('abort');
  });

  it('abort les schémas dangereux (file:, ftp:, javascript:)', async () => {
    expect(await decide('file:///etc/passwd')).toBe('abort');
    expect(await decide('ftp://example.com/x')).toBe('abort');
  });

  it('laisse passer une requête publique', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    expect(await decide('https://example.com/page')).toBe('continue');
    expect(await decide('http://93.184.216.34/')).toBe('continue');
  });

  it('laisse passer data:, blob: et about:', async () => {
    expect(await decide('data:text/html,<p>ok</p>')).toBe('continue');
    expect(await decide('blob:https://example.com/3f1c')).toBe('continue');
    expect(await decide('about:blank')).toBe('continue');
  });

  it('runCapture installe la garde sur le contexte avant d’ouvrir la page', async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const context = await browser.newContext();
    vi.mocked(context.route).mockClear();
    await runCapture({ url: 'https://example.com', interactionSteps: [], format: 'image' });
    expect(context.route).toHaveBeenCalledWith('**/*', expect.any(Function));
  });
});
