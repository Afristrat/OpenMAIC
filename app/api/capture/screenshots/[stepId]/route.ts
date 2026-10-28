/**
 * GET /api/capture/screenshots/[stepId] : redirige vers une URL signée de courte durée de la
 * capture d'écran, après avoir vérifié que l'étape appartient à l'auteur connecté. Le bucket est
 * privé : aucune autre voie n'existe pour lire l'image.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { apiError } from '@/lib/server/api-response';
import { privateArtifactUrl } from '@/lib/server/private-artifact-url';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureScreenshotAPI');

export async function GET(request: NextRequest, ctx: { params: Promise<{ stepId: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const stepId = z.uuid().safeParse((await ctx.params).stepId);
  if (!stepId.success) return apiError('INVALID_REQUEST', 400, 'Requête invalide');

  const supabase = createServiceSupabaseClient();
  const { data: step } = await supabase
    .from('capture_steps')
    .select('session_id, screenshot_path')
    .eq('id', stepId.data)
    .maybeSingle();
  const { data: session } = step
    ? await supabase
        .from('capture_sessions')
        .select('id')
        .eq('id', step.session_id as string)
        .eq('owner_id', auth.user.id)
        .maybeSingle()
    : { data: null };
  if (!step || !session || !step.screenshot_path) {
    return apiError('INVALID_REQUEST', 404, 'Capture introuvable');
  }

  try {
    const url = await privateArtifactUrl(
      'capture-screenshots',
      step.screenshot_path as string,
      false,
    );
    const response = NextResponse.redirect(url, 302);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    log.error('Failed to sign capture screenshot', error instanceof Error ? error.message : error);
    return apiError('INTERNAL_ERROR', 500, 'Capture indisponible');
  }
}
