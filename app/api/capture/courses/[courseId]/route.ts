/**
 * GET /api/capture/courses/[courseId] : sessions de capture d'un projet de l'auteur et leurs
 * étapes, pour la relecture. Aucun chemin de stockage n'est renvoyé : l'image d'une étape se lit
 * par /api/capture/screenshots/[stepId], qui revérifie le propriétaire.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

const log = createLogger('CaptureCourseAPI');

type SessionRow = {
  id: string;
  domain: string;
  captured_at: string;
  status: string;
  step_count: number;
  supersedes_capture_id: string | null;
};
type StepRow = {
  id: string;
  position: number;
  action: string;
  url: string;
  element: { label?: string } | null;
  description: string;
  review: 'pending' | 'approved' | 'rejected';
  screenshot_path: string | null;
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const courseId = z.uuid().safeParse((await ctx.params).courseId);
  if (!courseId.success) return apiError('INVALID_REQUEST', 400, 'Projet invalide');

  const supabase = createServiceSupabaseClient();
  const { data: course } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', courseId.data)
    .eq('owner_id', auth.user.id)
    .maybeSingle();
  if (!course) return apiError('INVALID_REQUEST', 404, 'Projet introuvable');

  const { data: sessions, error } = await supabase
    .from('capture_sessions')
    .select('id, domain, captured_at, status, step_count, supersedes_capture_id')
    .eq('course_id', courseId.data)
    .eq('owner_id', auth.user.id)
    .order('captured_at', { ascending: false });
  if (error) {
    log.error('Failed to read capture sessions', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Échec de la lecture des captures');
  }

  const rows = (sessions ?? []) as SessionRow[];
  const replaced = new Set(rows.flatMap((s) => (s.supersedes_capture_id ? [s.supersedes_capture_id] : [])));
  const result = [];
  for (const session of rows) {
    const { data: steps, error: stepsError } = await supabase
      .from('capture_steps')
      .select('id, position, action, url, element, description, review, screenshot_path')
      .eq('session_id', session.id)
      .order('position', { ascending: true });
    if (stepsError) {
      log.error('Failed to read capture steps', stepsError.message);
      return apiError('INTERNAL_ERROR', 500, 'Échec de la lecture des captures');
    }
    result.push({
      id: session.id,
      domain: session.domain,
      capturedAt: session.captured_at,
      status: session.status,
      replaced: replaced.has(session.id),
      steps: ((steps ?? []) as StepRow[]).map(({ screenshot_path, ...step }) => ({
        ...step,
        hasScreenshot: screenshot_path !== null,
      })),
    });
  }

  const response = apiSuccess({ course, sessions: result });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
