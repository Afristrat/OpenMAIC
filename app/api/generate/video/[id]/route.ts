import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const SIGNED_URL_EXPIRY_S = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data: generationJob, error } = await supabase
    .from('video_generation_jobs')
    .select('id, status, storage_path, result_metadata, error')
    .eq('id', id)
    .single();

  if (error || !generationJob) {
    return apiError('INVALID_REQUEST', 404, 'Video generation job not found');
  }

  let downloadUrl: string | null = null;
  if (generationJob.status === 'done' && generationJob.storage_path) {
    const serviceSupabase = createServiceSupabaseClient();
    const { data: signed, error: signError } = await serviceSupabase.storage
      .from('exports')
      .createSignedUrl(generationJob.storage_path, SIGNED_URL_EXPIRY_S);
    if (signError) return apiError('INTERNAL_ERROR', 500, signError.message);
    downloadUrl = signed?.signedUrl ?? null;
  }

  return apiSuccess({
    id: generationJob.id,
    status: generationJob.status,
    result: generationJob.result_metadata,
    error: generationJob.error,
    downloadUrl,
    done: generationJob.status === 'done' || generationJob.status === 'error',
    pollIntervalMs: 3000,
  });
}
