/**
 * Webhook Configuration API
 *
 * GET  /api/webhooks — List webhook configs for the current user's org
 * POST /api/webhooks — Create a new webhook config
 * DELETE /api/webhooks — Remove a webhook config by id
 */

import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/webhooks/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('WebhooksAPI');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the org where the current user has admin/manager role. */
async function resolveUserOrg(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .in('role', ['admin', 'manager'])
    .limit(1)
    .single();

  return data?.org_id ?? null;
}

function isValidWebhookEvent(e: unknown): e is WebhookEvent {
  return typeof e === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(e);
}

// ---------------------------------------------------------------------------
// GET — list webhook configs
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth.response) return auth.response;

  const supabase = await createServerSupabaseClient();
  const orgId = await resolveUserOrg(supabase, auth.user.id);

  if (!orgId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'No admin/manager org membership found');
  }

  const { data, error } = await supabase
    .from('webhook_configs')
    .select('id, url, events, active, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    log.error('Failed to list webhooks', { error });
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to list webhooks');
  }

  return NextResponse.json({ success: true, webhooks: data });
}

// ---------------------------------------------------------------------------
// POST — create webhook config
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth.response) return auth.response;

  const body = (await req.json().catch(() => null)) as {
    url?: string;
    events?: string[];
  } | null;

  if (!body?.url || !body.events || !Array.isArray(body.events)) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Missing required fields: url, events',
    );
  }

  // Validate URL
  try {
    new URL(body.url);
  } catch {
    return apiError(API_ERROR_CODES.INVALID_URL, 400, 'Invalid webhook URL');
  }

  // Validate events
  const invalidEvents = body.events.filter((e) => !isValidWebhookEvent(e));
  if (invalidEvents.length > 0) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      `Invalid events: ${invalidEvents.join(', ')}`,
    );
  }

  const supabase = await createServerSupabaseClient();
  const orgId = await resolveUserOrg(supabase, auth.user.id);

  if (!orgId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'No admin/manager org membership found');
  }

  const { data, error } = await supabase
    .from('webhook_configs')
    .insert({ org_id: orgId, url: body.url, events: body.events })
    .select('id, url, events, active, created_at')
    .single();

  if (error) {
    log.error('Failed to create webhook', { error });
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create webhook');
  }

  return NextResponse.json({ success: true, webhook: data });
}

// ---------------------------------------------------------------------------
// DELETE — remove webhook config
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const webhookId = searchParams.get('id');

  if (!webhookId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing webhook id parameter');
  }

  const supabase = await createServerSupabaseClient();
  const orgId = await resolveUserOrg(supabase, auth.user.id);

  if (!orgId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'No admin/manager org membership found');
  }

  const { error } = await supabase
    .from('webhook_configs')
    .delete()
    .eq('id', webhookId)
    .eq('org_id', orgId);

  if (error) {
    log.error('Failed to delete webhook', { error });
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete webhook');
  }

  return NextResponse.json({ success: true, deleted: true });
}
