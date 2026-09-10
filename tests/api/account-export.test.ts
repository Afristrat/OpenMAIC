import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), read: vi.fn(), identity: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    rpc: mocks.rpc,
    auth: { admin: { getUserById: mocks.identity } },
  }),
}));
import { GET } from '@/app/api/account/export/route';
const request = () => new NextRequest('http://localhost/api/account/export?userId=attacker');
describe('account export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'verified-user', email: 'test@example.test' } });
    mocks.rpc.mockImplementation((name, args) => ({ abortSignal: () => mocks.read(name, args) }));
    mocks.read.mockResolvedValue({ data: [], error: null });
    mocks.identity.mockResolvedValue({
      error: null,
      data: {
        user: {
          id: 'verified-user',
          email: 'test@example.test',
          created_at: '2026-09-10T00:00:00Z',
          identities: [
            { provider: 'email', identity_data: { secret: 'never-export' } },
            { provider: 'email' },
          ],
          user_metadata: { secret: 'never-export' },
          app_metadata: { secret: 'never-export' },
          factors: [{ secret: 'never-export' }],
        },
      },
    });
  });
  it('requires authentication before data access', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it('streams every page for the verified actor and finishes only after all sections', async () => {
    mocks.read.mockImplementation(async (_name, args) => ({
      error: null,
      data:
        args.p_section === 'session_events'
          ? [{ cursor: '00009007199254741300', value: { id: '9007199254741300' } }]
          : args.p_section !== 'pedagogy_telemetry'
            ? []
            : args.p_after === null
              ? Array.from({ length: 100 }, (_, i) => ({
                  cursor: String(i).padStart(4, '0'),
                  value: { id: i },
                }))
              : [{ cursor: '0100', value: { id: 100 } }],
    }));
    const response = await GET(request());
    const body = await response.json();
    expect(body.pedagogy_telemetry).toHaveLength(101);
    expect(body.complete).toBe(true);
    expect(mocks.identity).toHaveBeenCalledWith('verified-user');
    expect(body.accountIdentity).toEqual({
      id: 'verified-user',
      email: 'test@example.test',
      phone: null,
      createdAt: '2026-09-10T00:00:00Z',
      updatedAt: null,
      lastSignInAt: null,
      emailConfirmedAt: null,
      phoneConfirmedAt: null,
      providers: ['email'],
    });
    expect(JSON.stringify(body)).not.toContain('never-export');
    expect(body.includedSections).toHaveLength(55);
    expect(body.includedSections).toEqual(
      expect.arrayContaining([
        'session_events',
        'evaluations',
        'lti_quiz_attempts',
        'classroom_quiz_attempts',
        'discussion_patterns',
        'review_notification_preferences',
      ]),
    );
    expect(body.formatVersion).toBe(2);
    expect(body.bigintEncoding).toBe('decimal-string');
    expect(body.session_events[0].id).toBe('9007199254741300');
    expect(response.headers.get('cache-control')).toBe('no-store');
    for (const call of mocks.rpc.mock.calls) expect(call[1].p_actor).toBe('verified-user');
    for (const p_section of ['classroom_quiz_attempts', 'discussion_patterns']) {
      expect(mocks.rpc).toHaveBeenCalledWith('read_account_discussion_export_page', {
        p_actor: 'verified-user',
        p_section,
        p_after: null,
      });
    }
    expect(mocks.rpc).toHaveBeenCalledWith(
      'read_account_export_page',
      expect.objectContaining({ p_section: 'pedagogy_telemetry', p_after: '0099' }),
    );
  });
  it('returns an opaque failure before streaming when the schema is unavailable', async () => {
    mocks.read.mockResolvedValue({ error: { message: 'private database detail' }, data: null });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
  it('includes a session-protected import download link, never a signed token', async () => {
    const id = '00000000-0036-4000-8000-000000000354';
    mocks.read.mockImplementation(async (_name, args) => ({
      error: null,
      data: args.p_section === 'course_imports' ? [{ cursor: id, value: { id } }] : [],
    }));
    const body = await (await GET(request())).json();
    expect(body.course_imports[0].downloadUrl).toBe(`/api/account/export/imports/${id}`);
  });
  it.each([
    { error: { message: 'private auth detail' }, data: { user: null } },
    { error: null, data: { user: null } },
    { error: null, data: { user: { id: 'another-user' } } },
  ])('fails closed when Auth cannot prove the same identity', async (result) => {
    mocks.identity.mockResolvedValue(result);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(await response.json()).toEqual({ error: 'Account export unavailable' });
  });
  it('exports protected replay file links without embedding temporary signing tokens', async () => {
    const session_id = '00000000-0036-4000-8000-000000000402';
    const audio_path = `actor/${session_id}/file.wav`;
    mocks.read.mockImplementation(async (_name, args) => ({
      error: null,
      data:
        args.p_section === 'session_events'
          ? [{ cursor: '1', value: { id: '1', session_id, audio_path } }]
          : [],
    }));
    const body = await (await GET(request())).json();
    expect(body.session_events[0].downloadUrl).toBe(
      `/api/live-sessions/${session_id}/audio?path=${encodeURIComponent(audio_path)}&download=1`,
    );
  });
  it('links completed packages, generated videos and watermarked transmissions only', async () => {
    const id = '00000000-0036-4000-8000-000000000431';
    mocks.read.mockImplementation(async (_name, args) => ({
      error: null,
      data: ['export_jobs', 'video_generation_jobs', 'transmissions'].includes(args.p_section)
        ? [
            {
              cursor: id,
              value: {
                id,
                status: 'done',
                storage_path: 'file',
                visual_watermark_path: 'watermarked',
              },
            },
          ]
        : [],
    }));
    const body = await (await GET(request())).json();
    expect(body.export_jobs[0].downloadUrl).toBe(`/api/export-jobs/${id}?download=1`);
    expect(body.video_generation_jobs[0].downloadUrl).toBe(`/api/generate/video/${id}?download=1`);
    expect(body.transmissions[0].downloadUrl).toBe(`/api/transmissions/${id}/content?download=1`);
  });
  it('aborts a partial download on a later failure instead of certifying an incomplete export', async () => {
    mocks.read.mockImplementation(async (_name, args) =>
      args.p_section === 'widget_template_publications'
        ? { error: {}, data: null }
        : { error: null, data: [] },
    );
    const response = await GET(request());
    await expect(response.text()).rejects.toThrow('interrupted');
  });
});
