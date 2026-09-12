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
    .select(
      'id, ended_at, courses(id, org_id, language, outline, source_manifest_id, updated_at), castings(lineup)',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  const course = first(
    session?.courses as Related<{
      id: string;
      org_id: string;
      language: string;
      outline: Record<string, unknown>;
      source_manifest_id: string | null;
      updated_at: string;
    }>,
  );
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
      .select('id, ts_ms, actor, event_type, payload')
      .eq('session_id', id)
      .order('ts_ms', { ascending: true });
    if (eventsError) throw new Error(eventsError.message);
    const anchorEvents = (events ?? []).flatMap((event) => {
      const payload = event.payload as Record<string, unknown>;
      if (
        (event.actor !== 'agent' && event.actor !== 'user' && event.actor !== 'system') ||
        typeof event.event_type !== 'string' ||
        typeof event.ts_ms !== 'number' ||
        !payload ||
        Array.isArray(payload)
      ) {
        return [];
      }
      const idValue = event.id;
      if (
        (typeof idValue !== 'string' && typeof idValue !== 'number') ||
        !/^\d+$/u.test(String(idValue))
      ) {
        return [];
      }
      return [
        {
          id: String(idValue),
          actor: event.actor,
          event_type: event.event_type,
          payload,
          ts_ms: event.ts_ms,
        },
      ];
    });
    const sceneRefs = [
      ...new Set(
        anchorEvents
          .map((event) => event.payload)
          .map((payload) => payload.sceneId)
          .filter((value): value is string => typeof value === 'string'),
      ),
    ];
    const seedCasting = casting.lineup.flatMap((agent) => {
      const name = agent.name ?? agent.id;
      if (typeof name !== 'string' || name.trim().length === 0) return [];
      const optionalText = (key: 'role' | 'mechanismId' | 'persona') => {
        const value = agent[key];
        return typeof value === 'string' && value.trim().length > 0
          ? value.trim().slice(0, 1_000)
          : undefined;
      };
      return [
        {
          name: name.trim(),
          role: optionalText('role'),
          mechanismId: optionalText('mechanismId'),
          persona: optionalText('persona'),
        },
      ];
    });
    const personas = seedCasting.map((agent) => agent.name);
    if (sceneRefs.length === 0 || seedCasting.length === 0 || anchorEvents.length === 0) {
      throw new Error('Session events and casting personas are required');
    }
    const storedApproach = course.outline?.learningApproach;
    const learningApproach =
      storedApproach === 'pedagogy' || storedApproach === 'hybrid' ? storedApproach : 'andragogy';

    const body = await request.json().catch(() => ({}));
    const { model, thinkingConfig } = await resolveModelFromRequest(request, body);
    const result = await runWithUsageMeteringContext(request.headers, user.id, course.org_id, () =>
      callLLM(
        {
          model,
          system: ANCHOR_SEED_SYSTEM_PROMPT,
          prompt: buildSeedStockPrompt({
            language: course.language,
            learningApproach,
            casting: seedCasting,
            events: anchorEvents,
          }),
        },
        'anchor-seeds',
        undefined,
        thinkingConfig,
      ),
    );
    const seeds = parseSeedStock(result.text, {
      learningApproach,
      events: anchorEvents,
      personas,
      sceneRefs,
    });
    const { error: insertError } = await service.from('seeds').insert(
      seeds.map((seed) => ({
        session_id: id,
        persona: seed.persona,
        kind: seed.kind,
        content: seed.content,
        source_event_id: seed.content.provenance.event_id,
        source_kind: seed.content.provenance.source_kind,
        source_version: course.source_manifest_id
          ? `manifest:${course.source_manifest_id}`
          : `course:${course.id}@${course.updated_at}`,
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
