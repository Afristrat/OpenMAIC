import webPush from 'web-push';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface BrowserPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushPayload {
  title: string;
  body: string;
  targetUrl: string;
  tag?: string;
}

export interface WebPushDeliveryResult {
  subscriptionId: string;
  status: 'accepted' | 'failed' | 'expired';
  pushServiceStatus: number | null;
}

interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class WebPushConfigurationError extends Error {}
export class WebPushSubscriptionConflictError extends Error {}

function requiredVapidConfig(): { publicKey: string; privateKey: string; subject: string } {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() ?? '';

  if (
    !BASE64URL_PATTERN.test(publicKey) ||
    !BASE64URL_PATTERN.test(privateKey) ||
    !/^(mailto:|https:\/\/)/.test(subject)
  ) {
    throw new WebPushConfigurationError('Web Push VAPID configuration is missing or invalid');
  }
  return { publicKey, privateKey, subject };
}

export function getWebPushPublicKey(): string {
  return requiredVapidConfig().publicKey;
}

export function validateBrowserPushSubscription(value: unknown): BrowserPushSubscription | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<BrowserPushSubscription>;
  const expirationTime = candidate.expirationTime ?? null;
  const endpoint = candidate.endpoint;
  const p256dh = candidate.keys?.p256dh;
  const auth = candidate.keys?.auth;

  if (typeof endpoint !== 'string') return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || endpoint.length > 2048) return null;
  } catch {
    return null;
  }

  if (
    typeof p256dh !== 'string' ||
    p256dh.length < 40 ||
    p256dh.length > 256 ||
    !BASE64URL_PATTERN.test(p256dh) ||
    typeof auth !== 'string' ||
    auth.length < 16 ||
    auth.length > 256 ||
    !BASE64URL_PATTERN.test(auth) ||
    (expirationTime !== null &&
      (!Number.isSafeInteger(expirationTime) || expirationTime < Date.now()))
  ) {
    return null;
  }

  return { endpoint, expirationTime, keys: { p256dh, auth } };
}

export function validateWebPushTarget(targetUrl: string): boolean {
  return targetUrl.length <= 1024 && targetUrl.startsWith('/') && !targetUrl.startsWith('//');
}

export async function saveWebPushSubscription(
  userId: string,
  subscription: BrowserPushSubscription,
): Promise<void> {
  const service = createServiceSupabaseClient();
  const { data: existing, error: lookupError } = await service
    .from('push_subscriptions')
    .select('user_id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();
  if (lookupError) throw new Error(`Push subscription lookup failed: ${lookupError.message}`);
  if (existing && existing.user_id !== userId) {
    throw new WebPushSubscriptionConflictError('This browser subscription belongs to another user');
  }

  const { error } = await service.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expiration_time: subscription.expirationTime,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(`Push subscription save failed: ${error.message}`);
}

export async function deleteWebPushSubscription(userId: string, endpoint: string): Promise<void> {
  const service = createServiceSupabaseClient();
  const { error } = await service
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);
  if (error) throw new Error(`Push subscription deletion failed: ${error.message}`);
}

function pushErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : null;
}

async function recordDelivery(
  userId: string,
  subscriptionId: string,
  payload: WebPushPayload,
  status: WebPushDeliveryResult['status'],
  pushServiceStatus: number | null,
): Promise<void> {
  const service = createServiceSupabaseClient();
  const timestampColumn = status === 'accepted' ? 'last_success_at' : 'last_failure_at';
  const { error: updateError } = await service
    .from('push_subscriptions')
    .update({ [timestampColumn]: new Date().toISOString() })
    .eq('id', subscriptionId)
    .eq('user_id', userId);
  if (updateError) throw new Error(`Push subscription audit update failed: ${updateError.message}`);

  const { error: insertError } = await service.from('web_push_deliveries').insert({
    user_id: userId,
    subscription_id: subscriptionId,
    target_url: payload.targetUrl,
    status,
    push_service_status: pushServiceStatus,
    error_code: status === 'accepted' ? null : `PUSH_${pushServiceStatus ?? 'UNKNOWN'}`,
  });
  if (insertError) throw new Error(`Push delivery audit insert failed: ${insertError.message}`);
}

export async function sendWebPushToUser(
  userId: string,
  payload: WebPushPayload,
): Promise<WebPushDeliveryResult[]> {
  if (!validateWebPushTarget(payload.targetUrl)) throw new Error('Invalid Web Push target URL');
  const vapid = requiredVapidConfig();
  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw new Error(`Push subscription listing failed: ${error.message}`);

  return Promise.all(
    ((data ?? []) as StoredSubscription[]).map(async (subscription) => {
      let status: WebPushDeliveryResult['status'] = 'accepted';
      let pushServiceStatus: number | null = null;
      try {
        const response = await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: 'normal' },
        );
        pushServiceStatus = response.statusCode;
      } catch (sendError) {
        pushServiceStatus = pushErrorStatus(sendError);
        status = pushServiceStatus === 404 || pushServiceStatus === 410 ? 'expired' : 'failed';
      }

      await recordDelivery(userId, subscription.id, payload, status, pushServiceStatus);
      if (status === 'expired') {
        const { error: deleteError } = await service
          .from('push_subscriptions')
          .delete()
          .eq('id', subscription.id)
          .eq('user_id', userId);
        if (deleteError) throw new Error(`Expired push cleanup failed: ${deleteError.message}`);
      }
      return { subscriptionId: subscription.id, status, pushServiceStatus };
    }),
  );
}
