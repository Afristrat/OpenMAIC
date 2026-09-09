import { randomUUID } from 'node:crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { assertCourseGenerationAccess } from '@/lib/server/course-generation-access';
import { activateUsageMeteringJob } from '@/lib/billing/usage-context';
import { generateMeteredVideo } from '@/lib/server/metered-media-providers';
import {
  isServerConfiguredProvider,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
} from '@/lib/server/provider-config';
import type { VideoGenerationOptions, VideoProviderId } from '@/lib/media/types';

/** Claim once in PostgreSQL: a stalled/replayed queue job must not rebill a provider. */
export async function runManagedVideoJob(jobId: string): Promise<boolean> {
  const db = createServiceSupabaseClient();
  const read = () =>
    db
      .from('video_generation_jobs')
      .select('id, owner_id, org_id, status, storage_path, provider_id, model_id, request')
      .eq('id', jobId)
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
  const initial = await read();
  if (initial.error) throw new Error('Video job lookup unavailable');
  const job = initial.data;
  if (!job || job.status === 'done') return false;
  if (!job.org_id || !job.owner_id) throw new Error('Video job has no actor or tenant');
  if (job.status !== 'queued')
    throw new Error('Video job already started; automatic provider replay refused');
  const actor = job.owner_id;
  const tenant = job.org_id;
  // Authorization is independent of the queue payload and rechecked after the provider.
  const authorize = () => assertCourseGenerationAccess({ orgId: tenant }, actor);
  const claimed = await db
    .from('video_generation_jobs')
    .update({ status: 'generating', error: null })
    .eq('id', jobId)
    .eq('owner_id', actor)
    .eq('org_id', tenant)
    .eq('status', 'queued')
    .select('id')
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (claimed.error) throw new Error('Video job claim unavailable');
  if (!claimed.data) return false;
  const checkActive = async () => {
    await authorize();
    const current = await read();
    if (
      current.error ||
      !current.data ||
      current.data.owner_id !== actor ||
      current.data.org_id !== tenant ||
      current.data.status !== 'generating'
    ) {
      throw new Error('Video job no longer active');
    }
  };
  let storagePath: string | undefined;
  try {
    await checkActive();
    const providerId = job.provider_id as VideoProviderId;
    if (!isServerConfiguredProvider('video', providerId))
      throw new Error('Video provider is not server managed');
    activateUsageMeteringJob(actor, tenant, `video-job-${jobId}`);
    const result = await generateMeteredVideo(
      {
        providerId,
        apiKey: resolveVideoApiKey(providerId),
        baseUrl: resolveVideoBaseUrl(providerId),
        model: job.model_id ?? undefined,
      },
      job.request as unknown as VideoGenerationOptions,
    );
    await checkActive();
    // ponytail: 100 MiB decoded maximum; use streamed provider storage if larger videos are required.
    if (result.url.length > Math.ceil((100 * 1024 * 1024) / 3) * 4 + 64) {
      throw new Error('Managed video exceeds storage buffer limit');
    }
    const match = result.url.match(/^data:(video\/(?:mp4|webm));base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) throw new Error('Managed video provider returned no supported embedded video');
    const [, contentType, encoded] = match;
    const video = Buffer.from(encoded, 'base64');
    if (video.length > 100 * 1024 * 1024)
      throw new Error('Managed video exceeds storage buffer limit');
    storagePath = `generated-video/${actor}/${jobId}-${randomUUID()}.${contentType.toLowerCase() === 'video/webm' ? 'webm' : 'mp4'}`;
    await checkActive();
    const uploaded = await db.storage
      .from('exports')
      .upload(storagePath, video, { contentType, upsert: false });
    if (uploaded.error) throw new Error('Video upload failed');
    await checkActive();
    const saved = await db
      .from('video_generation_jobs')
      .update({
        status: 'done',
        storage_path: storagePath,
        result_metadata: {
          width: result.width,
          height: result.height,
          duration: result.duration,
          contentType,
        },
      })
      .eq('id', jobId)
      .eq('owner_id', actor)
      .eq('org_id', tenant)
      .eq('status', 'generating')
      .select('id')
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (saved.error || !saved.data) throw new Error('Video completion not acknowledged');
    return true;
  } catch (error) {
    if (storagePath) {
      // A lost completion response is ambiguous: never delete a file already linked
      // by a committed row, nor destroy it while the database cannot be inspected.
      const outcome = await read();
      if (outcome.error) throw new Error('Video outcome unresolved; uploaded file retained');
      if (outcome.data?.status === 'done' && outcome.data.storage_path === storagePath) return true;
      const removed = await db.storage.from('exports').remove([storagePath]);
      if (removed.error) throw new Error('Video cleanup failed; manual reconciliation required');
    }
    const failed = await db
      .from('video_generation_jobs')
      .update({ status: 'error', error: 'Video generation interrupted or failed' })
      .eq('id', jobId)
      .eq('owner_id', actor)
      .eq('org_id', tenant)
      .eq('status', 'generating')
      .select('id')
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (failed.error) throw new Error('Video failure status could not be saved');
    throw error;
  }
}
