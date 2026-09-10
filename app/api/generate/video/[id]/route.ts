import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { privateArtifactUrl } from '@/lib/server/private-artifact-url';

export const dynamic = 'force-dynamic';

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
  const download = request.nextUrl.searchParams.get('download') === '1';
  if (generationJob.status === 'done' && generationJob.storage_path) {
    try {
      const prefix = `generated-video/${auth.user.id}/${generationJob.id}`;
      if (
        !generationJob.storage_path.startsWith(prefix) ||
        !/^(-[0-9a-f-]{36})?\.(mp4|webm)$/.test(generationJob.storage_path.slice(prefix.length))
      )
        throw new Error();
      downloadUrl = await privateArtifactUrl(
        'exports',
        generationJob.storage_path,
        request.signal,
        download,
      );
    } catch {
      return apiError('INTERNAL_ERROR', 503, 'Video download unavailable');
    }
  }
  if (download) {
    if (!downloadUrl) return apiError('INVALID_REQUEST', 409, 'Video is not ready');
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: downloadUrl,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  const response = apiSuccess({
    id: generationJob.id,
    status: generationJob.status,
    result: generationJob.result_metadata,
    error: generationJob.error,
    downloadUrl,
    done: generationJob.status === 'done' || generationJob.status === 'error',
    pollIntervalMs: 3000,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
