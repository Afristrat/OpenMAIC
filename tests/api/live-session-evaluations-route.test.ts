import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  session: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.user },
    from: (table: string) => {
      if (table === 'live_sessions') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: mocks.session }) }),
          }),
        };
      }
      return {
        insert: (value: unknown) => ({ select: () => ({ single: () => mocks.insert(value) }) }),
      };
    },
  }),
}));

async function submit(body: unknown) {
  const { POST } = await import('@/app/api/live-sessions/[id]/evaluations/route');
  return POST(
    new Request('https://qalem.ma/api/live-sessions/session-1/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as NextRequest,
    { params: Promise.resolve({ id: 'session-1' }) },
  );
}

describe('live session hot evaluation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.session.mockResolvedValue({
      data: { id: 'session-1', ended_at: '2026-09-03T22:00:00Z' },
      error: null,
    });
    mocks.insert.mockImplementation(async (value) => ({ data: value, error: null }));
  });

  it('writes exactly two hot answers and their normalized score', async () => {
    const response = await submit({ useful: 5, confidence: 4 });

    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith({
      session_id: 'session-1',
      user_id: 'user-1',
      phase: 'hot',
      answers: { useful: 5, confidence: 4 },
      score: 90,
    });
  });

  it('rejects an incomplete answer, an unfinished session, and a duplicate phase', async () => {
    expect((await submit({ useful: 5 })).status).toBe(400);
    mocks.session.mockResolvedValueOnce({ data: { id: 'session-1', ended_at: null }, error: null });
    expect((await submit({ useful: 5, confidence: 4 })).status).toBe(409);
    mocks.insert.mockResolvedValueOnce({ data: null, error: { code: '23505' } });
    expect((await submit({ useful: 5, confidence: 4 })).status).toBe(409);
  });
});
