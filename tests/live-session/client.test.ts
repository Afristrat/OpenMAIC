import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('live session client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('starts only through the explicit recorded API contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, session: { id: 'session-1' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { startLiveSession } = await import('@/lib/live-session/client');

    await startLiveSession('classroom-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/live-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: 'classroom-1', recorded: true }),
    });
  });

  it('persists the authoritative TTS bytes alongside the speech event', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, session: { id: 'session-1' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(['voice'], { type: 'audio/wav' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { recordLiveSessionEvent, startLiveSession } = await import('@/lib/live-session/client');
    await startLiveSession('classroom-1');

    await recordLiveSessionEvent(
      'agent',
      'speech',
      { text: 'Bienvenue' },
      '/api/classroom-media/classroom-1/audio/intro.wav',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/classroom-media/classroom-1/audio/intro.wav',
    );
    const request = fetchMock.mock.calls[2];
    expect(request[0]).toBe('/api/live-sessions/session-1/events');
    expect(request[1]).toMatchObject({ method: 'POST' });
    expect(request[1].body).toBeInstanceOf(FormData);
    expect((request[1].body as FormData).get('audio')).toBeInstanceOf(Blob);
  });

  it('persists the learner microphone blob with the transcribed intervention', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, session: { id: 'session-1' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('{"success":true}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { recordLiveSessionEvent, startLiveSession } = await import('@/lib/live-session/client');
    await startLiveSession('classroom-1');
    const microphone = new Blob(['voice'], { type: 'audio/webm' });

    await recordLiveSessionEvent('user', 'user_message', { text: 'Question dictée' }, microphone);

    const form = fetchMock.mock.calls[1][1].body as FormData;
    expect(form.get('audio')).toBeInstanceOf(Blob);
    expect((form.get('audio') as Blob).size).toBe(5);
  });
});
