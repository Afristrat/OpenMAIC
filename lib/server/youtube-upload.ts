import JSZip from 'jszip';
import { exportJobArtifactPath } from '@/lib/export/export-job-artifact';
import { createLogger } from '@/lib/logger';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { freshAccessToken, uploadVideoResumable, YoutubeError } from '@/lib/server/youtube';
import type { YoutubePrivacy } from '@/lib/server/youtube';

const log = createLogger('YoutubeUpload');

/** Message montré à la personne ; le détail technique reste dans les journaux. */
function publicMessage(error: unknown): string {
  if (error instanceof YoutubeError) {
    if (error.code === 'RECONNECT_REQUIRED') return 'RECONNECT_REQUIRED';
    if (error.code === 'QUOTA_EXCEEDED') return 'QUOTA_EXCEEDED';
  }
  return 'UPLOAD_FAILED';
}

/** Le MP4 d'un chapitre : l'entrée de rang `chapterIndex` de l'archive de l'export `mp4`. */
export async function extractChapterVideo(zip: Buffer, chapterIndex: number): Promise<Buffer> {
  const archive = await JSZip.loadAsync(zip);
  const names = Object.keys(archive.files)
    .filter((name) => !archive.files[name].dir && name.toLowerCase().endsWith('.mp4'))
    .sort();
  const entry = names[chapterIndex] ? archive.file(names[chapterIndex]) : null;
  if (!entry) throw new Error(`Chapter ${chapterIndex} not found in export archive`);
  return entry.async('nodebuffer');
}

/** Exécute un envoi en file : lit l'export fini, l'envoie sur la chaîne de son propriétaire. */
export async function runYoutubeUpload(uploadId: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: upload, error: readError } = await supabase
    .from('youtube_uploads')
    .select('id, user_id, export_job_id, chapter_index, title, description, privacy_status, status')
    .eq('id', uploadId)
    .single();
  if (readError || !upload) throw new Error(`YouTube upload ${uploadId} not found`);
  if (upload.status === 'done') return;

  const fail = async (message: string): Promise<void> => {
    await supabase
      .from('youtube_uploads')
      .update({ status: 'error', error: message, updated_at: new Date().toISOString() })
      .eq('id', uploadId);
  };

  try {
    await supabase
      .from('youtube_uploads')
      .update({ status: 'uploading', error: null, updated_at: new Date().toISOString() })
      .eq('id', uploadId);

    const { data: job } = await supabase
      .from('export_jobs')
      .select('id, stage_id, format, status, storage_path')
      .eq('id', upload.export_job_id)
      .single();
    if (
      !job ||
      job.status !== 'done' ||
      job.storage_path !== exportJobArtifactPath(job.stage_id, job.id, job.format)
    ) {
      throw new Error('Export is not ready or its artifact path is not canonical');
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from('exports')
      .download(job.storage_path);
    if (downloadError || !blob)
      throw new Error(`Export download failed: ${downloadError?.message}`);
    const stored = Buffer.from(await blob.arrayBuffer());
    const video =
      job.format === 'mp4' && typeof upload.chapter_index === 'number'
        ? await extractChapterVideo(stored, upload.chapter_index)
        : stored;

    const accessToken = await freshAccessToken(upload.user_id);
    const privacy: YoutubePrivacy = upload.privacy_status;
    const uploaded = await uploadVideoResumable({
      accessToken,
      file: video,
      title: upload.title,
      description: upload.description,
      privacyStatus: privacy,
    });
    await supabase
      .from('youtube_uploads')
      .update({
        status: 'done',
        video_id: uploaded.videoId,
        applied_privacy: uploaded.appliedPrivacy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uploadId);
  } catch (error) {
    log.error(`YouTube upload ${uploadId} failed:`, error);
    await fail(publicMessage(error));
    throw error;
  }
}
