/**
 * Video Capsules API (Hyperframes, S1-006)
 *
 * POST /api/video-capsules — génère une capsule vidéo à partir d'une scène.
 * Construit le brief JSON (contrat P1-B), l'enregistre, et enfile un job
 * BullMQ qui pilote le studio Mishkāt de bout en bout (voir lib/jobs/workers.ts).
 *
 * Body: { stageId, sceneId, audience, tone, objective, durationS, notes? }
 * Response: { success: boolean, id?: string, status?: string, error?: string }
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isFeatureEnabled } from '@/lib/flags';
import { isHyperframesConfigured } from '@/lib/video/hyperframes-client';
import { buildHyperframesBrief } from '@/lib/video/hyperframes-brief';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { enqueueVideoCapsule } from '@/lib/jobs/queue';
import { createLogger } from '@/lib/logger';
import type { Locale } from '@/lib/i18n/types';
import type {
  HyperframesAudience,
  HyperframesObjective,
  HyperframesTone,
} from '@/lib/video/hyperframes-types';
import {
  HYPERFRAMES_AUDIENCES,
  HYPERFRAMES_OBJECTIVES,
  HYPERFRAMES_TONES,
} from '@/lib/video/hyperframes-types';

const log = createLogger('VideoCapsulesAPI');

interface CreateCapsuleBody {
  stageId?: string;
  sceneId?: string;
  audience?: HyperframesAudience;
  tone?: HyperframesTone;
  objective?: HyperframesObjective;
  durationS?: number;
  notes?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const enabled = await isFeatureEnabled('video_capsules');
  if (!enabled) {
    return apiError('PROVIDER_DISABLED', 403, 'La génération de capsules vidéo est désactivée');
  }

  if (!isHyperframesConfigured()) {
    return apiError(
      'MISSING_API_KEY',
      501,
      'Studio Mishkāt non configuré (MISHKAT_API_KEY / MISHKAT_BRAND_ID manquants)',
    );
  }

  try {
    const body = (await request.json()) as CreateCapsuleBody;
    const { stageId, sceneId, audience, tone, objective, durationS } = body;

    if (!stageId || !sceneId || !audience || !tone || !objective || !durationS) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'stageId, sceneId, audience, tone, objective et durationS sont requis',
      );
    }

    if (
      !HYPERFRAMES_AUDIENCES.includes(audience) ||
      !HYPERFRAMES_TONES.includes(tone) ||
      !HYPERFRAMES_OBJECTIVES.includes(objective)
    ) {
      return apiError('INVALID_REQUEST', 400, 'Audience, ton ou objectif vidéo invalide');
    }

    const supabase = await createServerSupabaseClient();

    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('id, name, language')
      .eq('id', stageId)
      .single();
    if (stageError || !stage) {
      return apiError('INVALID_REQUEST', 404, 'Cours introuvable');
    }

    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select('id, title')
      .eq('id', sceneId)
      .eq('stage_id', stageId)
      .single();
    if (sceneError || !scene) {
      return apiError('INVALID_REQUEST', 404, 'Scène introuvable');
    }

    const brief = buildHyperframesBrief({
      stageName: stage.name,
      sceneTitle: scene.title ?? stage.name,
      locale: (stage.language ?? 'fr-FR') as Locale,
      audience,
      tone,
      objective,
      durationS,
      notes: body.notes,
    });

    const serviceSupabase = createServiceSupabaseClient();
    const { data: capsule, error: insertError } = await serviceSupabase
      .from('video_capsules')
      .insert({
        stage_id: stageId,
        scene_id: sceneId,
        owner_id: auth.user.id,
        status: 'queued',
        brief,
      })
      .select('id, status')
      .single();

    if (insertError || !capsule) {
      log.error('Failed to insert video capsule', insertError?.message);
      return apiError('INTERNAL_ERROR', 500, 'Échec de la création de la capsule vidéo');
    }

    await enqueueVideoCapsule({ capsuleId: capsule.id as string });

    return apiSuccess({ id: capsule.id, status: capsule.status }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Video capsule creation failed:', error);
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
