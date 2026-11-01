import type { ExportJobFormat } from '@/lib/supabase/types';
import { trackingAdapters } from './scorm/tracking-adapters';

export function exportJobArtifactPath(
  stageId: string,
  exportJobId: string,
  format: ExportJobFormat,
): string {
  // `mp4` livre un fichier par chapitre réunis dans une archive ZIP ; `video` est le cours en un seul MP4.
  const extension =
    format === 'video'
      ? 'mp4'
      : format === 'mp4'
        ? 'zip'
        : trackingAdapters[format].archiveExtension;
  return `${stageId}/${exportJobId}.${extension}`;
}
