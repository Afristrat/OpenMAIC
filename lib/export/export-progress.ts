import type { ExportJobPhase, ExportJobStatus } from '@/lib/supabase/types';

export interface ExportJobProgress {
  phase: ExportJobPhase | null;
  done: number | null;
  total: number | null;
}

/** Avancement du rendu scène par scène, en pourcentage entier ; null tant qu'il n'est pas mesurable. */
export function progressPercent(progress: ExportJobProgress | null | undefined): number | null {
  if (!progress || progress.phase !== 'rendering') return null;
  const { done, total } = progress;
  if (done === null || total === null || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

/** Durée écoulée sous la forme m:ss, ou h:mm:ss au-delà d'une heure. */
export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

export interface ExportStatusMessage {
  key:
    | 'export.videoQueued'
    | 'export.videoStarting'
    | 'export.videoProgress'
    | 'export.videoAssembling'
    | 'export.videoUploading';
  values: Record<string, string | number>;
}

/** Ce que l'écran dit de l'état d'un rendu : toujours une phrase vivante, jamais un simple « en cours ». */
export function describeExportStatus(input: {
  status: ExportJobStatus | string | undefined;
  progress: ExportJobProgress | null | undefined;
  elapsedMs: number;
}): ExportStatusMessage {
  const elapsed = formatElapsed(input.elapsedMs);
  if (input.status === 'queued') return { key: 'export.videoQueued', values: { elapsed } };
  const percent = progressPercent(input.progress);
  if (percent !== null && input.progress) {
    return {
      key: 'export.videoProgress',
      values: {
        done: input.progress.done ?? 0,
        total: input.progress.total ?? 0,
        percent,
        elapsed,
      },
    };
  }
  if (input.progress?.phase === 'assembling') {
    return { key: 'export.videoAssembling', values: { elapsed } };
  }
  if (input.progress?.phase === 'uploading') {
    return { key: 'export.videoUploading', values: { elapsed } };
  }
  return { key: 'export.videoStarting', values: { elapsed } };
}
