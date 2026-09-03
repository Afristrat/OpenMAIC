import type { NextRequest } from 'next/server';
import { parseCreateLiveSession } from '@/lib/live-session/contracts';
import { isFeatureEnabled } from '@/lib/flags';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const log = createLogger('LiveSessionsAPI');

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      'id, course_id, recorded, started_at, ended_at, last_position_ms, courses(title, stage_id)',
    )
    .order('started_at', { ascending: false });
  if (error) {
    log.error('Live session listing failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lister les sessions');
  }
  return apiSuccess({ sessions: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!(await isFeatureEnabled('live_recording'))) {
    return apiError('INVALID_REQUEST', 404, 'Enregistrement indisponible');
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  let input;
  try {
    input = parseCreateLiveSession(await request.json());
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Le consentement explicite est requis');
  }

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('stage_id', input.stageId)
    .maybeSingle();
  if (courseError) {
    log.error('Live session course lookup failed', courseError.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de démarrer la session');
  }
  if (!course) return apiError('INVALID_REQUEST', 404, 'Formation introuvable');

  const { data: casting, error: castingError } = await supabase
    .from('castings')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', course.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (castingError) {
    log.error('Live session casting lookup failed', castingError.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de démarrer la session');
  }
  if (!casting) return apiError('INVALID_REQUEST', 409, 'Aucun casting actif pour cette formation');

  const { data: session, error } = await supabase
    .from('live_sessions')
    .insert({
      course_id: course.id,
      user_id: user.id,
      casting_id: casting.id,
      recorded: true,
    })
    .select('id, recorded, started_at')
    .single();
  if (error || !session) {
    log.error('Live session creation failed', error?.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de démarrer la session');
  }
  return apiSuccess({ session }, 201);
}
