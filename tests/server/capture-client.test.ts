import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestWebCapture } from '@/lib/server/capture-client';
import type { CaptureDecision } from '@/lib/generation/web-capture-plan';

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ error: null }),
      }),
    },
  }),
}));

const decision: CaptureDecision = {
  needsCapture: true,
  url: 'https://proxy.ai-mpower.com/ui',
  interactionSteps: [],
  format: 'image',
  reason: 'test',
};

describe('requestWebCapture', () => {
  const originalToken = process.env.CAPTURE_WORKER_TOKEN;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.CAPTURE_WORKER_TOKEN;
    else process.env.CAPTURE_WORKER_TOKEN = originalToken;
  });

  it('sends CAPTURE_WORKER_TOKEN as a Bearer Authorization header', async () => {
    process.env.CAPTURE_WORKER_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        buffer: Buffer.from('fake-png').toString('base64'),
        contentType: 'image/png',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await requestWebCapture(decision, 'classroom_123');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('uploads the returned buffer to Supabase Storage and returns its URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          buffer: Buffer.from('fake-png').toString('base64'),
          contentType: 'image/png',
        }),
      }),
    );
    const result = await requestWebCapture(decision, 'classroom_123');
    expect(result).toEqual({ assetUrl: expect.stringContaining('classroom_123'), format: 'image' });
  });

  it('returns null (never throws) when the capture service reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, error: 'Login wall detected' }),
      }),
    );
    const result = await requestWebCapture(decision, 'classroom_123');
    expect(result).toBeNull();
  });

  it('returns null (never throws) when the capture service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await requestWebCapture(decision, 'classroom_123');
    expect(result).toBeNull();
  });
});
