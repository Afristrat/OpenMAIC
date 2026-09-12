import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { notificationPreferencesSchema } from '@/lib/api/schemas';
import { validateBody } from '@/lib/api/validate';
import { normalizeWhatsAppNumber } from '@/lib/notifications/whatsapp-number';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from('review_notification_preferences')
    .select('email_enabled, whatsapp_enabled, whatsapp_number, locale, timezone, quiet_start, quiet_end, daily_cap, paused_until')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture des préférences');
  return apiSuccess({
    email: data?.email_enabled === true,
    whatsapp: data?.whatsapp_enabled === true,
    whatsappNumber: data?.whatsapp_number ?? null,
    locale: data?.locale ?? 'fr-FR',
    timezone: data?.timezone ?? 'UTC',
    quietStart: data?.quiet_start ?? null,
    quietEnd: data?.quiet_end ?? null,
    dailyCap: data?.daily_cap ?? 3,
    pausedUntil: data?.paused_until ?? null,
  });
}

export async function PATCH(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const validation = validateBody(
    notificationPreferencesSchema,
    await request.json().catch(() => null),
  );
  if (!validation.success) return validation.response;
  const { email, whatsapp, whatsappNumber, locale } = validation.data;
  const timezone = validation.data.timezone ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Fuseau horaire invalide');
  }
  const quietStart = validation.data.quietStart ?? null;
  const quietEnd = validation.data.quietEnd ?? null;
  if ((quietStart === null) !== (quietEnd === null)) {
    return apiError('INVALID_REQUEST', 400, 'Les deux bornes de la plage silencieuse sont requises');
  }
  const normalizedNumber = whatsappNumber ? normalizeWhatsAppNumber(whatsappNumber) : null;
  if (whatsapp && !normalizedNumber) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'Le numéro WhatsApp doit être au format international, par exemple +212600000000',
    );
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from('review_notification_preferences')
    .upsert(
      {
        user_id: auth.user.id,
        email_enabled: email,
        whatsapp_enabled: whatsapp,
        whatsapp_number: whatsapp ? normalizedNumber : null,
        locale,
        timezone,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        daily_cap: validation.data.dailyCap ?? 3,
        paused_until: validation.data.pausedUntil ?? null,
      },
      { onConflict: 'user_id' },
    )
    .select('email_enabled, whatsapp_enabled, whatsapp_number, locale, timezone, quiet_start, quiet_end, daily_cap, paused_until')
    .single();
  if (error || !data) {
    return apiError('INTERNAL_ERROR', 500, 'Échec d’enregistrement des préférences');
  }
  return apiSuccess({
    email: data.email_enabled,
    whatsapp: data.whatsapp_enabled,
    whatsappNumber: data.whatsapp_number,
    locale: data.locale,
    timezone: data.timezone,
    quietStart: data.quiet_start,
    quietEnd: data.quiet_end,
    dailyCap: data.daily_cap,
    pausedUntil: data.paused_until,
  });
}
