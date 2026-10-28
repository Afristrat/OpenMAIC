import type { ExportJobFormat } from '@/lib/supabase/types';
import { trackingAdapters } from './scorm/tracking-adapters';

export function exportJobArtifactPath(
  stageId: string,
  exportJobId: string,
  format: ExportJobFormat,
): string {
  // L'export MP4 livre un fichier par chapitre, réunis dans une archive ZIP.
  const extension = format === 'mp4' ? 'zip' : trackingAdapters[format].archiveExtension;
  return `${stageId}/${exportJobId}.${extension}`;
}
