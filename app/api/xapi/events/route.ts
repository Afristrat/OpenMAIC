import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { enqueueAnchorQuizStatement } from '@/lib/anchoring/xapi-outbox';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const quizEventSchema = z
  .object({
    type: z.literal('quiz_answered'),
    stageId: z.string().min(1).max(200),
    sceneId: z.string().min(1).max(200),
    score: z.number().min(0).max(100),
  })
  .strict();

export async function POST(request: NextRequest) {
  const parsed = quizEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 400, 'Événement xAPI invalide');
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return apiSuccess({ queued: false }, 202);

  const { data: course, error: courseError } = await auth
    .from('courses')
    .select('id')
    .eq('stage_id', parsed.data.stageId)
    .maybeSingle();
  if (courseError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture de la formation');
  if (!course) return apiError('INVALID_REQUEST', 404, 'Formation introuvable');
  const { data: session, error: sessionError } = await auth
    .from('live_sessions')
    .select('id')
    .eq('course_id', course.id)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture de la session');
  if (!session) return apiSuccess({ queued: false }, 202);

  const queued = await enqueueAnchorQuizStatement({
    sessionId: session.id,
    userId: user.id,
    sceneId: parsed.data.sceneId,
    score: parsed.data.score,
  }).catch(() => false);
  return apiSuccess({ queued }, 202);
}
