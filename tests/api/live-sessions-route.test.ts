import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  course: vi.fn(),
  casting: vi.fn(),
  insertSession: vi.fn(),
  insertEvent: vi.fn(),
  session: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

vi.mock('@/lib/flags', () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.user },
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    from: (table: string) => {
      if (table === 'courses') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: mocks.course }) }),
        };
      }
      if (table === 'castings') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: mocks.casting }) }) }),
            }),
          }),
        };
      }
      if (table === 'live_sessions') {
        return {
          insert: (value: unknown) => ({
            select: () => ({ single: () => mocks.insertSession(value) }),
          }),
          select: () => ({ eq: () => ({ maybeSingle: mocks.session }) }),
        };
      }
      if (table === 'session_events') {
        return {
          insert: (value: unknown) => ({
            select: () => ({ single: () => mocks.insertEvent(value) }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

async function startSession(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/live-sessions/route');
  return POST(
    new Request('https://qalem.ma/api/live-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as NextRequest,
  );
}

async function appendEvent(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/live-sessions/[id]/events/route');
  return POST(
    new Request('https://qalem.ma/api/live-sessions/session-1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as NextRequest,
    { params: Promise.resolve({ id: 'session-1' }) },
  );
}

async function appendAudioEvent() {
  const { POST } = await import('@/app/api/live-sessions/[id]/events/route');
  const form = new FormData();
  form.set(
    'event',
    JSON.stringify({
      tsMs: 20,
      actor: 'agent',
      eventType: 'speech',
      payload: { text: 'Bienvenue' },
    }),
  );
  form.set('audio', new Blob(['voice'], { type: 'audio/wav' }), 'voice.wav');
  return POST(
    new Request('https://qalem.ma/api/live-sessions/session-1/events', {
      method: 'POST',
      body: form,
    }) as NextRequest,
    { params: Promise.resolve({ id: 'session-1' }) },
  );
}

describe('live session API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.course.mockResolvedValue({ data: { id: 'course-1' }, error: null });
    mocks.casting.mockResolvedValue({ data: { id: 'casting-1' }, error: null });
    mocks.insertSession.mockResolvedValue({
      data: { id: 'session-1', recorded: true, started_at: '2026-09-03T20:00:00Z' },
      error: null,
    });
    mocks.session.mockResolvedValue({ data: { id: 'session-1', recorded: true }, error: null });
    mocks.insertEvent.mockResolvedValue({ data: { id: 1 }, error: null });
    mocks.upload.mockResolvedValue({ data: { path: 'stored' }, error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.isFeatureEnabled.mockResolvedValue(true);
  });

  it('never creates a replay without an explicit checked consent', async () => {
    const response = await startSession({ stageId: 'classroom-1', recorded: false });
    expect(response.status).toBe(400);
    expect(mocks.insertSession).not.toHaveBeenCalled();
  });

  it('fails closed while production recording is disabled', async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false);
    const response = await startSession({ stageId: 'classroom-1', recorded: true });
    expect(response.status).toBe(404);
    expect(mocks.insertSession).not.toHaveBeenCalled();
  });

  it('binds an explicitly recorded session to the authenticated learner and casting', async () => {
    const response = await startSession({ stageId: 'classroom-1', recorded: true });
    expect(response.status).toBe(201);
    expect(mocks.insertSession).toHaveBeenCalledWith({
      course_id: 'course-1',
      user_id: 'user-1',
      casting_id: 'casting-1',
      recorded: true,
    });
  });

  it('refuses to append events when the session is not recorded', async () => {
    mocks.session.mockResolvedValue({ data: { id: 'session-1', recorded: false }, error: null });
    const response = await appendEvent({
      tsMs: 10,
      actor: 'user',
      eventType: 'user_message',
      payload: { text: 'Question' },
    });
    expect(response.status).toBe(409);
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it('appends the learner event without an update path', async () => {
    const response = await appendEvent({
      tsMs: 10,
      actor: 'user',
      eventType: 'user_message',
      payload: { text: 'Question' },
    });
    expect(response.status).toBe(201);
    expect(mocks.insertEvent).toHaveBeenCalledWith({
      session_id: 'session-1',
      ts_ms: 10,
      actor: 'user',
      event_type: 'user_message',
      payload: { text: 'Question' },
      audio_path: null,
      audio_bytes: 0,
    });
  });

  it('stores uploaded audio privately and measures its exact byte size', async () => {
    const response = await appendAudioEvent();
    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/session-1\//),
      expect.any(Blob),
      expect.objectContaining({ contentType: 'audio/wav', upsert: false }),
    );
    expect(mocks.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        audio_path: expect.stringMatching(/^user-1\/session-1\//),
        audio_bytes: 5,
      }),
    );
  });
});
