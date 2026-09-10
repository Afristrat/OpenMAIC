import { beforeEach, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  insert: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  service: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: mocks.service }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: '00000000-0036-4000-8000-000000000401' } } }),
    },
    from: (table: string) =>
      table === 'live_sessions'
        ? { select: () => ({ eq: () => ({ maybeSingle: mocks.session }) }) }
        : { insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }) },
  }),
}));
import { POST } from '@/app/api/live-sessions/[id]/events/route';
const id = '00000000-0036-4000-8000-000000000402';
const event = { tsMs: 0, actor: 'user', eventType: 'speech', payload: {} };
function post(body: FormData | string) {
  return POST(
    new Request(`https://qalem.ma/api/live-sessions/${id}/events`, {
      method: 'POST',
      body,
      ...(typeof body === 'string' ? { headers: { 'content-type': 'application/json' } } : {}),
    }) as NextRequest,
    { params: Promise.resolve({ id }) },
  );
}
function multipart() {
  const body = new FormData();
  body.set('event', JSON.stringify(event));
  body.set('audio', new Blob(['voice'], { type: 'audio/wav' }), 'voice.wav');
  return body;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ data: { id, recorded: true } });
  mocks.insert.mockResolvedValue({ data: { id: '1' } });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.service.mockReturnValue({
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('session-audio');
        return { upload: mocks.upload, remove: mocks.remove };
      },
    },
  });
});
it('rejects forged JSON file references before privileged access', async () => {
  expect(
    (await post(JSON.stringify({ ...event, audioPath: 'foreign/file.wav', audioBytes: 5 }))).status,
  ).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.service).not.toHaveBeenCalled();
});
it('uploads through server Storage only after the recorded session is verified', async () => {
  expect((await post(multipart())).status).toBe(201);
  expect(mocks.service).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      session_id: id,
      audio_bytes: 5,
      audio_path: expect.stringMatching(
        new RegExp(`^00000000-0036-4000-8000-000000000401/${id}/[0-9a-f-]{36}\\.wav$`),
      ),
    }),
  );
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('never uploads for a missing session or missing recording consent', async () => {
  mocks.session.mockResolvedValueOnce({ data: null });
  expect((await post(multipart())).status).toBe(404);
  mocks.session.mockResolvedValueOnce({ data: { id, recorded: false } });
  expect((await post(multipart())).status).toBe(409);
  expect(mocks.service).not.toHaveBeenCalled();
});
it('compensates an append failure without claiming success', async () => {
  mocks.insert.mockResolvedValueOnce({ error: { message: 'deleted concurrently' } });
  expect((await post(multipart())).status).toBe(500);
  expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
});
