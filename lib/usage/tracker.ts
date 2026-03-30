// =============================================================================
// Qalem — Usage Tracking
// =============================================================================
//
// Records billable usage (TTS minutes, API calls, AI tokens, storage) into the
// usage_records table via the Supabase service role client.
//
// The service role bypasses RLS (the table policy denies all non-service access).
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import type { UsageSummaryRow } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Service-role Supabase client (server-side only, never exposed to the browser)
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for usage tracking',
    );
  }

  // No Database generic — consistent with other service-role clients in the codebase
  // (e.g. lib/lti/grade-service.ts, lib/telemetry/pedagogy-collector.ts)
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsageMetric = 'tts_minutes' | 'api_calls' | 'ai_tokens' | 'storage_mb';

export interface TrackUsageParams {
  userId?: string;
  orgId?: string;
  metric: UsageMetric;
  quantity: number;
}

export interface UsageSummary {
  orgId: string;
  billingPeriod: string;
  ttsMinutes: number;
  apiCalls: number;
  aiTokens: number;
  storageMb: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a usage event in the database.
 *
 * Errors are logged but swallowed — usage tracking must never break
 * the primary request path.
 */
export async function trackUsage(params: TrackUsageParams): Promise<void> {
  try {
    const supabase = getServiceClient();
    const billingPeriod = currentBillingPeriod();

    const { error } = await supabase.from('usage_records').insert({
      org_id: params.orgId ?? null,
      user_id: params.userId ?? null,
      metric: params.metric,
      quantity: params.quantity,
      billing_period: billingPeriod,
    });

    if (error) {
      console.error('[usage-tracker] Failed to record usage:', error.message);
    }
  } catch (err) {
    console.error('[usage-tracker] Unexpected error:', err);
  }
}

/**
 * Fetch the aggregated usage summary for an organisation in a given period.
 *
 * @param orgId  - Organisation UUID
 * @param period - Billing period string (e.g. "2026-03"). Defaults to current month.
 */
export async function getUsageSummary(
  orgId: string,
  period?: string,
): Promise<UsageSummary> {
  const supabase = getServiceClient();
  const billingPeriod = period ?? currentBillingPeriod();

  // Query the usage_summary view (untyped client — cast the result)
  const { data, error } = (await supabase
    .from('usage_summary')
    .select('*')
    .eq('org_id', orgId)
    .eq('billing_period', billingPeriod)
    .maybeSingle()) as { data: UsageSummaryRow | null; error: { message: string } | null };

  if (error) {
    console.error('[usage-tracker] Failed to fetch usage summary:', error.message);
  }

  return {
    orgId,
    billingPeriod,
    ttsMinutes: Number(data?.tts_minutes ?? 0),
    apiCalls: Number(data?.api_calls ?? 0),
    aiTokens: Number(data?.ai_tokens ?? 0),
    storageMb: Number(data?.storage_mb ?? 0),
  };
}
