import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const paramsSchema = z.object({ courseId: z.string().uuid() });
const bodySchema = z
  .object({
    pausedUntil: z.string().datetime().nullable(),
    dailyCap: z.number().int().min(1).max(10).nullable(),
    minimumIntervalHours: z.union([z.literal(24), z.literal(72), z.literal(168)]).nullable(),
  })
  .strict();

function trustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return origin === new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://qalem.ma').origin;
  } catch {
    return origin === 'https://qalem.ma';
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return apiError('INVALID_REQUEST', 400, 'Formation invalide');
  const service = createServiceSupabaseClient();
  const { data: preview, error: previewError } = await service.rpc(
    'get_course_notification_preview',
    {
      target_user_id: auth.user.id,
      target_course_id: params.data.courseId,
      target_time: new Date().toISOString(),
    },
  );
  if (previewError) return apiError('INVALID_REQUEST', 403, 'Formation indisponible');
  const { data, error } = await service
    .from('course_notification_preferences')
    .select('paused_until, daily_cap, minimum_interval_hours')
    .eq('course_id', params.data.courseId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) return apiError('INTERNAL_ERROR', 503, 'Préférences indisponibles');
  return apiSuccess({
    pausedUntil: data?.paused_until ?? null,
    dailyCap: data?.daily_cap ?? null,
    minimumIntervalHours: data?.minimum_interval_hours ?? null,
    nextReminderAt: preview?.[0]?.next_reminder_at ?? null,
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (!trustedOrigin(request)) return apiError('INVALID_REQUEST', 403, 'Origine non autorisée');
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success)
    return apiError('INVALID_REQUEST', 400, 'Préférences invalides');
  const { data, error } = await createServiceSupabaseClient()
    .from('course_notification_preferences')
    .upsert(
      {
        course_id: params.data.courseId,
        user_id: auth.user.id,
        paused_until: body.data.pausedUntil,
        daily_cap: body.data.dailyCap,
        minimum_interval_hours: body.data.minimumIntervalHours,
      },
      { onConflict: 'course_id,user_id' },
    )
    .select('paused_until, daily_cap, minimum_interval_hours')
    .single();
  if (error || !data) return apiError('INVALID_REQUEST', 403, 'Formation indisponible');
  const { data: preview, error: previewError } = await createServiceSupabaseClient().rpc(
    'get_course_notification_preview',
    {
      target_user_id: auth.user.id,
      target_course_id: params.data.courseId,
      target_time: new Date().toISOString(),
    },
  );
  if (previewError) return apiError('INTERNAL_ERROR', 503, 'Aperçu indisponible');
  return apiSuccess({
    pausedUntil: data.paused_until,
    dailyCap: data.daily_cap,
    minimumIntervalHours: data.minimum_interval_hours,
    nextReminderAt: preview?.[0]?.next_reminder_at ?? null,
  });
}
