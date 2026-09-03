import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ user: vi.fn(), event: vi.fn(), download: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.event }) }) }),
    }),
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));

describe('GET /api/live-sessions/[id]/audio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.event.mockResolvedValue({
      data: { audio_path: 'user-1/session-1/voice.wav' },
      error: null,
    });
    mocks.download.mockResolvedValue({
      data: new Blob(['voice'], { type: 'audio/wav' }),
      error: null,
    });
  });

  it('streams an owned replay track inline and never as an attachment', async () => {
    const { GET } = await import('@/app/api/live-sessions/[id]/audio/route');
    const response = await GET(
      new Request(
        'https://qalem.ma/api/live-sessions/session-1/audio?path=user-1%2Fsession-1%2Fvoice.wav',
      ) as NextRequest,
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('inline');
    expect(response.headers.get('Content-Disposition')).not.toContain('attachment');
    expect(mocks.download).toHaveBeenCalledWith('user-1/session-1/voice.wav');
  });
});
