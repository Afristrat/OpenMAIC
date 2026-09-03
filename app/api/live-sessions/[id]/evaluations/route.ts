import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const hotEvaluationSchema = z.object({
  useful: z.number().int().min(1).max(5),
  confidence: z.number().int().min(1).max(5),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const parsed = hotEvaluationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError('INVALID_REQUEST', 400, 'Les deux réponses de 1 à 5 sont requises');
  }

  const { id } = await params;
  const { data: session, error: sessionError } = await supabase
    .from('live_sessions')
    .select('id, ended_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (sessionError) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture de la session');
  if (!session?.ended_at) {
    return apiError('INVALID_REQUEST', 409, 'La session doit être terminée avant son évaluation');
  }

  const score = ((parsed.data.useful + parsed.data.confidence) / 10) * 100;
  const { data, error } = await supabase
    .from('evaluations')
    .insert({
      session_id: id,
      user_id: user.id,
      phase: 'hot',
      answers: parsed.data,
      score,
    })
    .select('id, phase, score')
    .single();
  if (error?.code === '23505') {
    return apiError('INVALID_REQUEST', 409, 'Cette évaluation a déjà été envoyée');
  }
  if (error || !data) return apiError('INTERNAL_ERROR', 500, 'Échec de l’évaluation');
  return apiSuccess({ evaluation: data }, 201);
}
