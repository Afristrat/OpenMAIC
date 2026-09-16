import type { ExportJobFormat } from '@/lib/supabase/types';
import { trackingAdapters } from './scorm/tracking-adapters';

export function exportJobArtifactPath(
  stageId: string,
  exportJobId: string,
  format: ExportJobFormat,
): string {
  const extension = format === 'mp4' ? 'mp4' : trackingAdapters[format].archiveExtension;
  return `${stageId}/${exportJobId}.${extension}`;
}
