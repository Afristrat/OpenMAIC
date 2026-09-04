import { translate, type Locale } from '@/lib/i18n';
import { normalizeWhatsAppNumber } from '@/lib/notifications/whatsapp-number';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type ReviewNotificationChannel = 'email' | 'whatsapp';

export interface ClaimedReviewNotification {
  deliveryId: string;
  channel: ReviewNotificationChannel;
}

interface ReviewNotificationDelivery {
  id: string;
  user_id: string;
  channel: ReviewNotificationChannel;
  due_count: number;
  review_card_id: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
}

interface ReviewNotificationPreferences {
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  locale: Locale;
}

export class ReviewNotificationProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === 'runtime-only') {
    throw new ReviewNotificationProviderError(`${name}_MISSING`);
  }
  return value;
}

function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://qalem.ma';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    return url.origin;
  } catch {
    throw new ReviewNotificationProviderError('NEXT_PUBLIC_APP_URL_INVALID');
  }
}

function reminderText(locale: Locale, dueCount: number): string {
  return translate(locale, 'notifications.reviewDue', { count: dueCount });
}

export async function sendReviewEmail(input: {
  deliveryId: string;
  recipient: string;
  locale: Locale;
  dueCount: number;
  targetUrl: string;
}): Promise<string | null> {
  const apiKey = requiredEnvironment('RESEND_API_KEY');
  const from = requiredEnvironment('SMTP_FROM');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `qalem-review/${input.deliveryId}`,
    },
    body: JSON.stringify({
      from,
      to: [input.recipient],
      subject: translate(input.locale, 'notifications.reviewEmailSubject'),
      text: [
        reminderText(input.locale, input.dueCount),
        input.targetUrl,
        translate(input.locale, 'notifications.managePreferences'),
        `${appOrigin()}/settings?tab=notifications`,
      ].join('\n\n'),
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new ReviewNotificationProviderError('RESEND_NETWORK_ERROR');
  });
  if (!response.ok) {
    throw new ReviewNotificationProviderError(`RESEND_HTTP_${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return typeof body?.id === 'string' ? body.id : null;
}

export async function sendReviewWhatsApp(input: {
  deliveryId: string;
  recipient: string;
  locale: Locale;
  dueCount: number;
  targetUrl: string;
}): Promise<string | null> {
  const baseUrl = requiredEnvironment('EVOLUTION_API_URL').replace(/\/+$/, '');
  const apiKey = requiredEnvironment('EVOLUTION_API_KEY');
  const instance = encodeURIComponent(requiredEnvironment('EVOLUTION_INSTANCE_NAME'));
  const number = normalizeWhatsAppNumber(input.recipient);
  if (!number) throw new ReviewNotificationProviderError('WHATSAPP_NUMBER_INVALID');

  const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: number.slice(1),
      text: [
        '*Qalem*',
        reminderText(input.locale, input.dueCount),
        input.targetUrl,
        translate(input.locale, 'notifications.managePreferences'),
        `${appOrigin()}/settings?tab=notifications`,
      ].join('\n\n'),
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    // Evolution API has no idempotency contract: an ambiguous network failure
    // is terminal for this daily batch so a retry cannot duplicate a message.
    throw new ReviewNotificationProviderError('EVOLUTION_NETWORK_AMBIGUOUS');
  });
  if (!response.ok) {
    throw new ReviewNotificationProviderError(`EVOLUTION_HTTP_${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as {
    key?: { id?: unknown };
    message?: { key?: { id?: unknown } };
  } | null;
  const messageId = body?.key?.id ?? body?.message?.key?.id;
  return typeof messageId === 'string' ? messageId : null;
}

export async function claimDueReviewNotifications(
  targetTime = new Date(),
): Promise<ClaimedReviewNotification[]> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service.rpc('claim_due_review_notifications', {
    target_time: targetTime.toISOString(),
  });
  if (error) throw new Error('Review notification claim failed');
  return ((data ?? []) as Array<{ delivery_id: string; delivery_channel: string }>).flatMap(
    (row) =>
      row.delivery_channel === 'email' || row.delivery_channel === 'whatsapp'
        ? [{ deliveryId: row.delivery_id, channel: row.delivery_channel }]
        : [],
  );
}

export async function deliverReviewNotification(deliveryId: string): Promise<void> {
  const service = createServiceSupabaseClient();
  const { data: rawDelivery, error: deliveryError } = await service
    .from('review_notification_deliveries')
    .select('id, user_id, channel, due_count, review_card_id, status')
    .eq('id', deliveryId)
    .maybeSingle();
  if (deliveryError) throw new Error('Review notification lookup failed');
  const delivery = rawDelivery as ReviewNotificationDelivery | null;
  if (!delivery || delivery.status === 'sent' || delivery.status === 'cancelled') return;

  const { data: rawPreferences, error: preferencesError } = await service
    .from('review_notification_preferences')
    .select('email_enabled, whatsapp_enabled, whatsapp_number, locale')
    .eq('user_id', delivery.user_id)
    .maybeSingle();
  if (preferencesError) throw new Error('Review notification preferences lookup failed');
  const preferences = rawPreferences as ReviewNotificationPreferences | null;
  const enabled =
    delivery.channel === 'email'
      ? preferences?.email_enabled === true
      : preferences?.whatsapp_enabled === true && Boolean(preferences.whatsapp_number);
  if (!enabled || !preferences) {
    const { error } = await service
      .from('review_notification_deliveries')
      .update({ status: 'cancelled', error_code: null })
      .eq('id', delivery.id)
      .in('status', ['pending', 'failed']);
    if (error) throw new Error('Review notification cancellation failed');
    return;
  }

  const targetPath = delivery.review_card_id
    ? `/review?card=${encodeURIComponent(delivery.review_card_id)}`
    : '/review';
  const targetUrl = `${appOrigin()}${targetPath}`;

  try {
    let providerMessageId: string | null;
    if (delivery.channel === 'email') {
      const { data, error } = await service.auth.admin.getUserById(delivery.user_id);
      const email = data.user?.email?.trim();
      if (error || !email) throw new ReviewNotificationProviderError('EMAIL_RECIPIENT_MISSING');
      providerMessageId = await sendReviewEmail({
        deliveryId: delivery.id,
        recipient: email,
        locale: preferences.locale,
        dueCount: delivery.due_count,
        targetUrl,
      });
    } else {
      providerMessageId = await sendReviewWhatsApp({
        deliveryId: delivery.id,
        recipient: preferences.whatsapp_number!,
        locale: preferences.locale,
        dueCount: delivery.due_count,
        targetUrl,
      });
    }

    const { error } = await service
      .from('review_notification_deliveries')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: providerMessageId,
        error_code: null,
      })
      .eq('id', delivery.id)
      .in('status', ['pending', 'failed']);
    if (error) throw new Error('Review notification completion failed');
  } catch (error) {
    const code =
      error instanceof ReviewNotificationProviderError ? error.code : 'DELIVERY_INTERNAL_ERROR';
    await service.rpc('record_review_notification_failure', {
      target_delivery_id: delivery.id,
      failure_code: code,
    });
    throw new Error(code);
  }
}
