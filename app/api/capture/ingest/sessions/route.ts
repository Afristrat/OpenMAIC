/**
 * POST /api/capture/ingest/sessions : ouvre une session de capture dans un projet de l'auteur.
 *
 * Sans attestation de droit (`rightsAttested: true`), pas de session : l'auteur déclare avoir le
 * droit de capturer ce site, la date de la déclaration est conservée. `supersedesCaptureId`
 * désigne la session que « Recapturer » remplace (même projet obligatoire, vérifié en base).
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureSessionsAPI');

/** Nom d'hôte, éventuellement suivi d'un port : jamais de schéma, de chemin ni d'identifiants. */
const DOMAIN = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/;

const bodySchema = z.strictObject({
  courseId: z.uuid(),
  domain: z.string().trim().toLowerCase().regex(DOMAIN, 'Domaine invalide'),
  toolVersion: z.string().trim().min(1).max(40),
  rightsAttested: z.literal(true),
  supersedesCaptureId: z.uuid().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'Session invalide : projet, domaine, version et attestation de droit sont requis',
    );
  }
  const body = parsed.data;

  const supabase = createServiceSupabaseClient();
  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('id', body.courseId)
    .eq('owner_id', auth.ownerId)
    .maybeSingle();
  if (!course) return apiError('INVALID_REQUEST', 404, 'Projet introuvable');

  const { data, error } = await supabase
    .from('capture_sessions')
    .insert({
      course_id: body.courseId,
      owner_id: auth.ownerId,
      domain: body.domain,
      tool_version: body.toolVersion,
      rights_attested_at: new Date().toISOString(),
      supersedes_capture_id: body.supersedesCaptureId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) {
    log.error('Failed to open capture session', error?.message);
    // La capture remplacée d'un autre projet est refusée par la base (déclencheur d'intégrité).
    return apiError('INVALID_REQUEST', 400, 'Impossible d’ouvrir la session de capture');
  }
  return apiSuccess({ id: data.id as string }, 201);
}
