import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ user: vi.fn(), event: vi.fn(), sign: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.event }) }) }),
    }),
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
  }),
}));

describe('GET /api/live-sessions/[id]/audio', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    mocks.user.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.event.mockResolvedValue({
      data: { audio_path: 'user-1/session-1/voice.wav' },
      error: null,
    });
    mocks.sign.mockResolvedValue({
      data: {
        signedUrl:
          'https://storage.example.test/storage/v1/object/sign/session-audio/voice.wav?token=fixture',
      },
      error: null,
    });
  });

  it('redirects an owned replay to short-lived inline Storage delivery without buffering', async () => {
    const { GET } = await import('@/app/api/live-sessions/[id]/audio/route');
    const response = await GET(
      new Request(
        'https://qalem.ma/api/live-sessions/session-1/audio?path=user-1%2Fsession-1%2Fvoice.wav',
      ) as NextRequest,
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    expect(response.status).toBe(307);
    expect(await response.text()).toBe('');
    expect(response.headers.get('location')).toContain('https://storage.example.test/');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.sign).toHaveBeenCalledWith('user-1/session-1/voice.wav', 60, { download: false });
  });
  async function load(download = false) {
    const { GET } = await import('@/app/api/live-sessions/[id]/audio/route');
    return GET(
      new Request(
        `https://qalem.ma/api/live-sessions/session-1/audio?path=user-1/session-1/voice.wav${download ? '&download=1' : ''}`,
      ) as NextRequest,
      { params: Promise.resolve({ id: 'session-1' }) },
    );
  }
  it('supports an explicit export attachment through the same authorization', async () => {
    expect((await load(true)).status).toBe(307);
    expect(mocks.sign).toHaveBeenCalledWith('user-1/session-1/voice.wav', 60, { download: true });
  });
  it('never signs an unauthenticated, missing or unavailable event', async () => {
    mocks.user.mockResolvedValueOnce({ data: { user: null } });
    expect((await load()).status).toBe(401);
    mocks.event.mockResolvedValueOnce({ data: null });
    expect((await load()).status).toBe(404);
    mocks.event.mockResolvedValueOnce({ error: { message: 'offline' } });
    expect((await load()).status).toBe(500);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it.each([
    { error: {}, data: null },
    { data: { signedUrl: 'https://foreign.example/file' } },
    { data: { signedUrl: 'not-a-url' } },
  ])('rejects failed or foreign signing results', async (result) => {
    mocks.sign.mockResolvedValue(result);
    expect((await load()).status).toBe(503);
  });
});
