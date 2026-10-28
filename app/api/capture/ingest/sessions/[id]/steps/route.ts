/**
 * POST /api/capture/ingest/sessions/[id]/steps : dépose une étape capturée.
 *
 * Le serveur ne fait confiance à rien : schéma strict, URL réduite à l'origine et au chemin, texte
 * libre refusé s'il ressemble à une donnée personnelle ou à un secret, image JPEG vérifiée
 * (signature, taille, empreinte recalculée). Une étape refusée n'est jamais stockée ni nettoyée :
 * l'auteur recapture. Le refus nomme le champ et le motif, sans reproduire la valeur.
 */

import { NextRequest } from 'next/server';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import {
  CAPTURE_FORMAT_VERSION,
  captureStepSchema,
  decodeScreenshot,
  findStepRefusal,
  normalizeStepUrl,
  stepContentHash,
} from '@/lib/capture/step';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureStepsAPI');

const BUCKET = 'capture-screenshots';

/** L'hôte de l'étape est celui de la session ou un de ses sous-domaines (connexion puis application). */
function hostBelongsToDomain(url: string, domain: string): boolean {
  const host = new URL(url).host;
  return host === domain || host.endsWith(`.${domain}`);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;
  const { id: sessionId } = await context.params;

  const supabase = createServiceSupabaseClient();
  const { data: session } = await supabase
    .from('capture_sessions')
    .select('id, domain, status')
    .eq('id', sessionId)
    .eq('owner_id', auth.ownerId)
    .maybeSingle();
  if (!session) return apiError('INVALID_REQUEST', 404, 'Session introuvable');
  if (session.status !== 'receiving') {
    return apiError('INVALID_REQUEST', 409, 'Session déjà terminée');
  }

  const parsed = captureStepSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 400, 'Étape invalide');
  const step = parsed.data;

  const url = normalizeStepUrl(step.url);
  if (!url) {
    return apiError(
      'CONTENT_SENSITIVE',
      422,
      'URL refusée : seuls l’origine et le chemin sont acceptés',
      'url',
    );
  }
  if (!hostBelongsToDomain(url, session.domain as string)) {
    return apiError('INVALID_REQUEST', 422, 'L’URL sort du domaine de la session', 'url');
  }

  const refusal = findStepRefusal(step);
  if (refusal) {
    return apiError(
      'CONTENT_SENSITIVE',
      422,
      'Étape refusée : le texte ressemble à une donnée personnelle ou à un secret',
      `${refusal.field}:${refusal.reason}`,
    );
  }

  const { data: existing } = await supabase
    .from('capture_steps')
    .select('id')
    .eq('session_id', sessionId)
    .eq('position', step.position)
    .maybeSingle();
  if (existing) return apiError('INVALID_REQUEST', 409, 'Une étape existe déjà à cette position');

  const screenshot = step.screenshot === undefined ? null : decodeScreenshot(step.screenshot);
  if (step.screenshot !== undefined && !screenshot) {
    return apiError(
      'INVALID_REQUEST',
      422,
      'Capture d’écran refusée : JPEG de 2 Mo au plus requis',
    );
  }

  const screenshotPath = screenshot ? `${auth.ownerId}/${sessionId}/${step.position}.jpg` : null;
  if (screenshot && screenshotPath) {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(screenshotPath, screenshot.bytes, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) {
      log.error('Failed to upload capture screenshot', uploadError.message);
      return apiError('INTERNAL_ERROR', 500, 'Échec du dépôt de la capture d’écran');
    }
  }

  const { error: insertError } = await supabase.from('capture_steps').insert({
    session_id: sessionId,
    format_version: CAPTURE_FORMAT_VERSION,
    position: step.position,
    captured_at: step.capturedAt,
    action: step.action,
    url,
    element: step.element,
    pointer: step.pointer ?? null,
    viewport: step.viewport,
    description: step.description,
    screenshot_path: screenshotPath,
    screenshot_sha256: screenshot?.sha256 ?? null,
    redactions: step.redactions,
    content_sha256: stepContentHash(step, url, screenshot?.sha256 ?? null),
  });
  if (insertError) {
    if (screenshotPath) await supabase.storage.from(BUCKET).remove([screenshotPath]);
    // 23505 : la position existe déjà dans cette session.
    if (insertError.code === '23505') {
      return apiError('INVALID_REQUEST', 409, 'Une étape existe déjà à cette position');
    }
    log.error('Failed to insert capture step', insertError.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de l’enregistrement de l’étape');
  }

  const { count } = await supabase
    .from('capture_steps')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  await supabase
    .from('capture_sessions')
    .update({ step_count: count ?? 0 })
    .eq('id', sessionId);

  return apiSuccess({ position: step.position }, 201);
}
