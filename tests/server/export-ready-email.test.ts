import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: serviceMock.client,
}));

import {
  exportsPageUrl,
  notifyExportReady,
  sendExportReadyEmail,
} from '@/lib/server/export-ready-email';

/** Client de service minimal : chaque table renvoie sa ligne, `auth.admin` l'utilisateur. */
function fakeService(rows: {
  job: Record<string, unknown> | null;
  stage: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  email: string | null;
}) {
  const byTable: Record<string, unknown> = {
    export_jobs: rows.job,
    stages: rows.stage,
    review_notification_preferences: rows.preferences,
  };
  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: byTable[table] ?? null }),
      };
      return query;
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: rows.email ? { email: rows.email } : null },
        }),
      },
    },
  };
}

describe('export ready email', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('SMTP_FROM', 'Qalem <exports@ai-mpower.com>');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    serviceMock.client.mockReset();
  });

  it('points to the exports page, never to a signed download URL', () => {
    expect(exportsPageUrl()).toBe('https://qalem.ma/exports');
  });

  it('sends one idempotent message with the course, the format and the page link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendExportReadyEmail({
      exportJobId: 'job-1',
      recipient: 'author@example.com',
      locale: 'fr-FR',
      courseName: 'Vente <B2B>',
      format: 'mp4',
      pageUrl: 'https://qalem.ma/exports',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'qalem-export-ready/job-1' });
    const payload = JSON.parse(String(init.body));
    expect(payload.to).toEqual(['author@example.com']);
    expect(payload.subject).toBe('Votre export « Vente <B2B> » est prêt');
    expect(payload.text).toContain('https://qalem.ma/exports');
    expect(payload.html).toContain('Vente &lt;B2B&gt;');
    expect(payload.html).toContain('href="https://qalem.ma/exports"');
  });

  it('writes the message right to left in Arabic', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendExportReadyEmail({
      exportJobId: 'job-2',
      recipient: 'author@example.com',
      locale: 'ar-MA',
      courseName: 'المبيعات',
      format: 'scorm12',
      pageUrl: 'https://qalem.ma/exports',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.subject).toBe('تصدير «المبيعات» جاهز');
    expect(payload.html).toContain('dir="rtl"');
  });

  it('notifies the owner in the language of their preferences', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    serviceMock.client.mockReturnValue(
      fakeService({
        job: {
          id: 'job-3',
          stage_id: 'stage-1',
          owner_id: 'user-1',
          format: 'mp4',
          notify_email: true,
        },
        stage: { name: 'Sales onboarding' },
        preferences: { locale: 'en-US' },
        email: 'author@example.com',
      }),
    );

    await notifyExportReady('job-3');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).subject).toBe('Your export “Sales onboarding” is ready');
  });

  it('falls back to French and to an untitled course when nothing is known', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    serviceMock.client.mockReturnValue(
      fakeService({
        job: {
          id: 'job-4',
          stage_id: 'stage-1',
          owner_id: 'user-1',
          format: 'cmi5',
          notify_email: true,
        },
        stage: null,
        preferences: null,
        email: 'author@example.com',
      }),
    );

    await notifyExportReady('job-4');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.subject).toBe('Votre export « Cours sans titre » est prêt');
  });

  it('never throws when the provider refuses the message, the export is already stored', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    serviceMock.client.mockReturnValue(
      fakeService({
        job: {
          id: 'job-5',
          stage_id: 'stage-1',
          owner_id: 'user-1',
          format: 'mp4',
          notify_email: true,
        },
        stage: { name: 'Cours' },
        preferences: null,
        email: 'author@example.com',
      }),
    );

    await expect(notifyExportReady('job-5')).resolves.toBeUndefined();
  });

  it('sends nothing when the export has no owner or the owner has no address', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    serviceMock.client.mockReturnValue(
      fakeService({
        job: { id: 'job-6', owner_id: null },
        stage: null,
        preferences: null,
        email: null,
      }),
    );
    await notifyExportReady('job-6');

    serviceMock.client.mockReturnValue(
      fakeService({
        job: {
          id: 'job-7',
          stage_id: 'stage-1',
          owner_id: 'user-1',
          format: 'mp4',
          notify_email: true,
        },
        stage: { name: 'Cours' },
        preferences: null,
        email: null,
      }),
    );
    await notifyExportReady('job-7');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the author did not ask for an email at launch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    serviceMock.client.mockReturnValue(
      fakeService({
        job: {
          id: 'job-8',
          stage_id: 'stage-1',
          owner_id: 'user-1',
          format: 'mp4',
          notify_email: false,
        },
        stage: { name: 'Cours' },
        preferences: null,
        email: 'author@example.com',
      }),
    );

    await notifyExportReady('job-8');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
