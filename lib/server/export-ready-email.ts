import { translate, type Locale } from '@/lib/i18n';
import { createLogger } from '@/lib/logger';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('ExportReadyEmail');

export class ExportReadyEmailError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Libellé affiché dans le message pour chaque format d'export. */
const FORMAT_LABELS: Record<string, string> = {
  mp4: 'MP4',
  scorm12: 'SCORM 1.2',
  scorm2004: 'SCORM 2004',
  cmi5: 'cmi5',
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === 'runtime-only') {
    throw new ExportReadyEmailError(`${name}_MISSING`);
  }
  return value;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  };
  return value.replace(/[&<>'"]/g, (character) => entities[character]);
}

/** Adresse de la page « Mes exports » : le lien du message ne porte aucune URL signée, qui expire. */
export function exportsPageUrl(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://qalem.ma';
  let url: URL;
  try {
    url = new URL(configuredOrigin);
  } catch {
    throw new ExportReadyEmailError('NEXT_PUBLIC_APP_URL_INVALID');
  }
  if (url.protocol !== 'https:') throw new ExportReadyEmailError('NEXT_PUBLIC_APP_URL_INVALID');
  url.pathname = '/exports';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function uiLocale(value: string | null | undefined): Locale {
  if (value === 'ar-MA' || value === 'en-US' || value === 'fr-FR') return value;
  return 'fr-FR';
}

export async function sendExportReadyEmail(input: {
  exportJobId: string;
  recipient: string;
  locale: Locale;
  courseName: string;
  format: string;
  pageUrl: string;
}): Promise<void> {
  const apiKey = requiredEnvironment('RESEND_API_KEY');
  const from = requiredEnvironment('SMTP_FROM');
  const values = {
    course: input.courseName,
    format: FORMAT_LABELS[input.format] ?? input.format,
  };
  const intro = translate(input.locale, 'exports.emailIntro', values);
  const footer = translate(input.locale, 'exports.emailFooter');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `qalem-export-ready/${input.exportJobId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.recipient],
      subject: translate(input.locale, 'exports.emailSubject', values),
      text: [intro, input.pageUrl, footer].join('\n\n'),
      html: [
        `<p dir="${input.locale === 'ar-MA' ? 'rtl' : 'ltr'}">${escapeHtml(intro)}</p>`,
        `<p><a href="${escapeHtml(input.pageUrl)}">${escapeHtml(translate(input.locale, 'exports.emailAction'))}</a></p>`,
        `<p>${escapeHtml(footer)}</p>`,
      ].join(''),
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new ExportReadyEmailError('RESEND_NETWORK_ERROR');
  });
  if (!response.ok) throw new ExportReadyEmailError(`RESEND_HTTP_${response.status}`);
}

/**
 * Prévient le propriétaire d'un export terminé, s'il l'a demandé au lancement (`notify_email`).
 * Le courriel est transactionnel (il répond à une action de la personne) : il ne passe pas
 * par le budget des rappels de révision.
 * Un échec d'envoi ne remet jamais en cause l'export, déjà déposé : il est journalisé.
 */
export async function notifyExportReady(exportJobId: string): Promise<void> {
  try {
    const service = createServiceSupabaseClient();
    const { data: job } = await service
      .from('export_jobs')
      .select('id, stage_id, owner_id, format, notify_email')
      .eq('id', exportJobId)
      .maybeSingle();
    // Le courriel n'existe que sur demande de l'auteur, faite au lancement de l'export.
    if (!job?.owner_id || job.notify_email !== true) return;

    const [{ data: owner }, { data: stage }, { data: preferences }] = await Promise.all([
      service.auth.admin.getUserById(job.owner_id as string),
      service.from('stages').select('name').eq('id', job.stage_id).maybeSingle(),
      service
        .from('review_notification_preferences')
        .select('locale')
        .eq('user_id', job.owner_id)
        .maybeSingle(),
    ]);
    const recipient = owner.user?.email?.trim();
    if (!recipient) throw new ExportReadyEmailError('EMAIL_RECIPIENT_MISSING');

    const locale = uiLocale((preferences as { locale?: string } | null)?.locale);
    const courseName = (stage?.name as string | undefined)?.trim();
    await sendExportReadyEmail({
      exportJobId,
      recipient,
      locale,
      courseName: courseName || translate(locale, 'exports.untitled'),
      format: job.format as string,
      pageUrl: exportsPageUrl(),
    });
  } catch (error) {
    log.warn(
      `Export ready email not sent for ${exportJobId}:`,
      error instanceof ExportReadyEmailError ? error.code : error,
    );
  }
}
