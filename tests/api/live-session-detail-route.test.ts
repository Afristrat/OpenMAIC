import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  update: vi.fn(),
  audioPaths: vi.fn(),
  remove: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.user },
    storage: { from: () => ({ remove: mocks.remove }) },
    from: (table: string) => {
      if (table === 'session_events') {
        return { select: () => ({ eq: () => mocks.audioPaths() }) };
      }
      return {
        update: (value: unknown) => ({
          eq: () => ({ select: () => ({ maybeSingle: () => mocks.update(value) }) }),
        }),
        delete: () => ({ eq: () => ({ select: () => ({ maybeSingle: mocks.deleteSession }) }) }),
      };
    },
  }),
}));

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/live-sessions/[id]/route');
  return PATCH(
    new Request('https://qalem.ma/api/live-sessions/session-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as NextRequest,
    { params: Promise.resolve({ id: 'session-1' }) },
  );
}

async function removeSession() {
  const { DELETE } = await import('@/app/api/live-sessions/[id]/route');
  return DELETE(
    new Request('https://qalem.ma/api/live-sessions/session-1', {
      method: 'DELETE',
    }) as NextRequest,
    { params: Promise.resolve({ id: 'session-1' }) },
  );
}

describe('live session detail API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.update.mockResolvedValue({ data: { id: 'session-1' }, error: null });
    mocks.audioPaths.mockResolvedValue({
      data: [{ audio_path: 'user-1/session-1/agent.wav' }, { audio_path: null }],
      error: null,
    });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.deleteSession.mockResolvedValue({ data: { id: 'session-1' }, error: null });
  });

  it('persists a valid replay position and rejects negative positions', async () => {
    expect((await patch({ positionMs: -1 })).status).toBe(400);
    expect((await patch({ positionMs: 4200 })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ last_position_ms: 4200 });
  });

  it('removes every private audio track before deleting the replay rows', async () => {
    const response = await removeSession();
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(['user-1/session-1/agent.wav']);
    expect(mocks.deleteSession).toHaveBeenCalled();
  });
});
