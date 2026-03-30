/**
 * Webhook dispatcher — delivers events to registered webhook endpoints.
 *
 * Features:
 * - HMAC-SHA256 payload signing
 * - CloudEvents-style headers
 * - Exponential backoff retry (3 attempts: 1 s, 4 s, 16 s)
 * - Delivery logging to Supabase
 */

import { createHmac, randomUUID } from 'crypto';
import { createLogger } from '@/lib/logger';
import type { WebhookEvent } from './types';

const log = createLogger('WebhookDispatcher');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf-8').digest('hex');
}

const RETRY_DELAYS_MS = [1_000, 4_000, 16_000] as const;

// ---------------------------------------------------------------------------
// Internal: single delivery attempt
// ---------------------------------------------------------------------------

interface DeliveryResult {
  statusCode: number | null;
  responseBody: string | null;
  success: boolean;
}

async function attemptDelivery(
  url: string,
  body: string,
  signature: string,
  event: WebhookEvent,
): Promise<DeliveryResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'Ce-Type': `qalem.${event}`,
        'Ce-Source': 'qalem-api',
        'Ce-Id': randomUUID(),
        'Ce-Specversion': '1.0',
      },
      body,
      signal: controller.signal,
    });

    const responseBody = await res.text().catch(() => '');
    return { statusCode: res.status, responseBody, success: res.ok };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { statusCode: null, responseBody: message, success: false };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Internal: log delivery to Supabase
// ---------------------------------------------------------------------------

async function logDelivery(
  webhookId: string,
  event: WebhookEvent,
  payload: unknown,
  result: DeliveryResult,
  attempt: number,
): Promise<void> {
  try {
    // Dynamic import to avoid circular deps at module load time
    const { createServiceSupabaseClient } = await import('@/lib/supabase/service');
    const supabase = createServiceSupabaseClient();

    await supabase.from('webhook_deliveries').insert({
      webhook_id: webhookId,
      event,
      payload,
      status_code: result.statusCode,
      response_body: result.responseBody,
      attempt,
    });
  } catch (err) {
    log.warn('Failed to log webhook delivery', { webhookId, event, err });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch a webhook event to all matching configs for the given org.
 *
 * Fetches active webhook configs whose `events` array contains the given
 * event, then delivers to each with retries.
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  payload: unknown,
  orgId?: string,
): Promise<void> {
  try {
    const { createServiceSupabaseClient } = await import('@/lib/supabase/service');
    const supabase = createServiceSupabaseClient();

    let query = supabase
      .from('webhook_configs')
      .select('*')
      .eq('active', true)
      .contains('events', [event]);

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data: configs, error } = await query;

    if (error) {
      log.error('Failed to fetch webhook configs', { event, error });
      return;
    }

    if (!configs || configs.length === 0) return;

    // Deliver to each config concurrently
    await Promise.allSettled(
      configs.map((config) => deliverWithRetry(config, event, payload)),
    );
  } catch (err) {
    log.error('Webhook dispatch failed', { event, err });
  }
}

async function deliverWithRetry(
  config: { id: string; url: string; secret: string },
  event: WebhookEvent,
  payload: unknown,
): Promise<void> {
  const body = JSON.stringify({
    event,
    payload,
    timestamp: new Date().toISOString(),
  });
  const signature = signPayload(body, config.secret);

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const result = await attemptDelivery(config.url, body, signature, event);

    // Log every attempt
    await logDelivery(config.id, event, payload, result, attempt + 1);

    if (result.success) {
      log.info('Webhook delivered', { webhookId: config.id, event, attempt: attempt + 1 });
      return;
    }

    log.warn('Webhook delivery failed, retrying', {
      webhookId: config.id,
      event,
      attempt: attempt + 1,
      statusCode: result.statusCode,
    });

    // Wait before retry (except on last attempt)
    if (attempt < RETRY_DELAYS_MS.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }

  log.error('Webhook delivery exhausted retries', { webhookId: config.id, event });
}
