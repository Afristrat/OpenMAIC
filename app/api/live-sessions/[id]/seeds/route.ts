import type { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  ANCHOR_SEED_PROMPT_VERSION,
  ANCHOR_SEED_SYSTEM_PROMPT,
  buildSeedStockPrompt,
  parseSeedStock,
} from '@/lib/anchoring/seed-stock';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
import { isFeatureEnabled } from '@/lib/flags';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const maxDuration = 90;

type Related<T> = T | T[] | null;

function first<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isFeatureEnabled('anchoring'))) {
    return apiError('INVALID_REQUEST', 404, 'Ancrage indisponible');
  }
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { id } = await params;
  const { data: session, error: sessionError } = await auth
    .from('live_sessions')
    .select('id, ended_at, courses(org_id, language), castings(lineup)')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  const course = first(session?.courses as Related<{ org_id: string; language: string }>);
  const casting = first(session?.castings as Related<{ lineup: Record<string, unknown>[] }>);
  if (sessionError || !session || !course?.org_id || !casting || !session.ended_at) {
    return apiError('INVALID_REQUEST', 409, 'Session terminée et casting requis');
  }

  const service = createServiceSupabaseClient();
  const operationKey = `anchor-seeds-${id}`;
  const { error: claimError } = await service.from('seed_generation_runs').insert({
    session_id: id,
    user_id: user.id,
    org_id: course.org_id,
    prompt_version: ANCHOR_SEED_PROMPT_VERSION,
    usage_operation_key: operationKey,
  });
  if (claimError?.code === '23505') return apiSuccess({ status: 'already_generated' });
  if (claimError) return apiError('INTERNAL_ERROR', 500, 'Échec du verrou de génération');

  try {
    const { data: events, error: eventsError } = await service
      .from('session_events')
      .select('ts_ms, actor, event_type, payload')
      .eq('session_id', id)
      .order('ts_ms', { ascending: true });
    if (eventsError) throw new Error(eventsError.message);
    const sceneRefs = [
      ...new Set(
        (events ?? [])
          .map((event) => event.payload as Record<string, unknown>)
          .map((payload) => payload.sceneId)
          .filter((value): value is string => typeof value === 'string'),
      ),
    ];
    const personas = casting.lineup
      .map((agent) => agent.name ?? agent.id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (sceneRefs.length === 0 || personas.length === 0) {
      throw new Error('Session events and casting personas are required');
    }

    const body = await request.json().catch(() => ({}));
    const { model, thinkingConfig } = await resolveModelFromRequest(request, body);
    const result = await runWithUsageMeteringContext(request.headers, user.id, course.org_id, () =>
      callLLM(
        {
          model,
          system: ANCHOR_SEED_SYSTEM_PROMPT,
          prompt: buildSeedStockPrompt({
            language: course.language,
            personas,
            events: events ?? [],
          }),
        },
        'anchor-seeds',
        undefined,
        thinkingConfig,
      ),
    );
    const seeds = parseSeedStock(result.text, { personas, sceneRefs });
    const { error: insertError } = await service.from('seeds').insert(
      seeds.map((seed) => ({
        session_id: id,
        persona: seed.persona,
        kind: seed.kind,
        content: seed.content,
      })),
    );
    if (insertError) throw new Error(insertError.message);
    const { error: completeError } = await service
      .from('seed_generation_runs')
      .update({
        status: 'completed',
        input_tokens: result.totalUsage.inputTokens ?? 0,
        output_tokens: result.totalUsage.outputTokens ?? 0,
        completed_at: new Date().toISOString(),
      })
      .eq('session_id', id);
    if (completeError) throw new Error(completeError.message);
    return apiSuccess({ seeds, promptVersion: ANCHOR_SEED_PROMPT_VERSION }, 201);
  } catch (error) {
    await service
      .from('seed_generation_runs')
      .update({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
      .eq('session_id', id);
    return apiError('GENERATION_FAILED', 502, 'Échec de génération du stock d’ancrage');
  }
}
