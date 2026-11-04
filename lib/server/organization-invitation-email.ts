import { translate, type Locale } from '@/lib/i18n';

export class OrganizationInvitationEmailError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function organizationInvitationUrl(token: string): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://qalem.ma';
  let url: URL;
  try {
    url = new URL(configuredOrigin);
  } catch {
    throw new OrganizationInvitationEmailError('NEXT_PUBLIC_APP_URL_INVALID');
  }
  if (url.protocol !== 'https:') {
    throw new OrganizationInvitationEmailError('NEXT_PUBLIC_APP_URL_INVALID');
  }
  url.pathname = '/auth';
  url.search = new URLSearchParams({ invite: token }).toString();
  url.hash = '';
  return url.toString();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === 'runtime-only') {
    throw new OrganizationInvitationEmailError(`${name}_MISSING`);
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

function invitationUiLocale(locale: string): Locale {
  const language = locale.trim().toLowerCase().split('-')[0];
  if (language === 'ar') return 'ar-MA';
  if (language === 'en') return 'en-US';
  return 'fr-FR';
}

async function sendInvitationEmail(input: {
  idempotencyKey: string;
  recipient: string;
  locale: Locale;
  subjectKey: string;
  introKey: string;
  actionKey: string;
  params: Record<string, string>;
  inviteUrl: string;
}): Promise<string | null> {
  const apiKey = requiredEnvironment('RESEND_API_KEY');
  const from = requiredEnvironment('SMTP_FROM');
  const escapedParams = Object.fromEntries(
    Object.entries(input.params).map(([key, value]) => [key, escapeHtml(value)]),
  );
  const inviteUrl = escapeHtml(input.inviteUrl);
  const { locale } = input;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.recipient],
      subject: translate(locale, input.subjectKey, input.params),
      text: [
        translate(locale, input.introKey, input.params),
        input.inviteUrl,
        translate(locale, 'org.invitationEmailFooter'),
      ].join('\n\n'),
      html: [
        `<p>${translate(locale, input.introKey, escapedParams)}</p>`,
        `<p><a href="${inviteUrl}">${translate(locale, input.actionKey)}</a></p>`,
        `<p>${translate(locale, 'org.invitationEmailFooter')}</p>`,
      ].join(''),
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new OrganizationInvitationEmailError('RESEND_NETWORK_ERROR');
  });
  if (!response.ok) {
    throw new OrganizationInvitationEmailError(`RESEND_HTTP_${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return typeof body?.id === 'string' ? body.id : null;
}

/** Sends the organization token only to its nominated recipient. */
export async function sendOrganizationInvitationEmail(input: {
  invitationId: string;
  recipient: string;
  organizationName: string;
  locale: string;
  inviteUrl: string;
}): Promise<string | null> {
  return sendInvitationEmail({
    idempotencyKey: `qalem-organization-invitation/${input.invitationId}`,
    recipient: input.recipient,
    locale: invitationUiLocale(input.locale),
    subjectKey: 'org.invitationEmailSubject',
    introKey: 'org.invitationEmailIntro',
    actionKey: 'org.invitationEmailAction',
    params: { organization: input.organizationName },
    inviteUrl: input.inviteUrl,
  });
}

/** Sends the one-classroom share token only to the nominated recipient (no organization membership). */
export async function sendStageShareInvitationEmail(input: {
  invitationId: string;
  recipient: string;
  courseName: string;
  locale: string;
  inviteUrl: string;
}): Promise<string | null> {
  return sendInvitationEmail({
    idempotencyKey: `qalem-stage-share-invitation/${input.invitationId}`,
    recipient: input.recipient,
    locale: invitationUiLocale(input.locale),
    subjectKey: 'share.invitationEmailSubject',
    introKey: 'share.invitationEmailIntro',
    actionKey: 'share.invitationEmailAction',
    params: { course: input.courseName },
    inviteUrl: input.inviteUrl,
  });
}
