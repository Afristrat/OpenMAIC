/**
 * Projets de formation de l'auteur, vus depuis l'extension de capture (jeton Bearer).
 *
 * GET  : liste des projets non archivés de l'auteur, pour choisir où envoyer la capture.
 * POST : crée un projet en brouillon (un `course` sans classroom), pour capturer avant que la
 *        formation existe. La génération de la formation le rattachera ensuite à son stage.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureProjectsAPI');

const createSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  language: z.enum(['fr-FR', 'ar-MA', 'en-US']),
});

export async function GET(request: NextRequest) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;

  const { data, error } = await createServiceSupabaseClient()
    .from('courses')
    .select('id, title, language, status, updated_at')
    .eq('owner_id', auth.ownerId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) {
    log.error('Failed to list projects', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la lecture des projets');
  }
  const response = apiSuccess({ projects: data ?? [] });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(request: NextRequest) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 400, 'Titre ou langue invalide');

  const { data, error } = await createServiceSupabaseClient()
    .from('courses')
    .insert({
      owner_id: auth.ownerId,
      title: parsed.data.title,
      language: parsed.data.language,
      source_kind: 'generated',
      status: 'draft',
    })
    .select('id, title, language, status')
    .single();
  if (error || !data) {
    log.error('Failed to create project', error?.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la création du projet');
  }
  return apiSuccess({ project: data }, 201);
}
