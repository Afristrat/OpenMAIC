import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  organizationInvitationUrl,
  sendOrganizationInvitationEmail,
} from '@/lib/server/organization-invitation-email';

describe('organization invitation email', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('SMTP_FROM', 'Qalem <invitations@ai-mpower.com>');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds invitation URLs from the configured canonical HTTPS origin', () => {
    expect(organizationInvitationUrl('one-time-token')).toBe(
      'https://qalem.ma/auth?invite=one-time-token',
    );
  });

  it('sends one idempotent email to the nominated recipient without returning its token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'provider-message-id' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendOrganizationInvitationEmail({
        invitationId: 'invite-1',
        recipient: 'learner@example.com',
        organizationName: 'Institut <Atlas>',
        locale: 'fr-FR',
        inviteUrl: 'https://qalem.ma/auth?invite=one-time-token',
      }),
    ).resolves.toBe('provider-message-id');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer resend-test-key',
      'Idempotency-Key': 'qalem-organization-invitation/invite-1',
    });
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      to: ['learner@example.com'],
      subject: 'Votre invitation à rejoindre Institut <Atlas> sur Qalem',
    });
    expect(payload.html).toContain('Institut &lt;Atlas&gt;');
  });
});
