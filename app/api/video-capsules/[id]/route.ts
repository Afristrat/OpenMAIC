/**
 * GET /api/video-capsules/[id] — statut de génération d'une capsule vidéo
 * (polling côté client pendant le job BullMQ / rendu Mishkāt).
 */

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();

  const { data: capsule, error } = await supabase
    .from('video_capsules')
    .select('id, status, variants, error, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !capsule) {
    return apiError('INVALID_REQUEST', 404, 'Capsule vidéo introuvable');
  }

  return apiSuccess({
    id: capsule.id,
    status: capsule.status,
    variants: capsule.variants ?? [],
    error: capsule.error,
    done: capsule.status === 'done' || capsule.status === 'error',
    pollIntervalMs: 5000,
  });
}
