'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { useMissingVoices } from '@/lib/hooks/use-missing-voices';
import { guardSpeechAudio } from './speech-audio-guard';
import { slideToPng } from '@openmaic/renderer/snapshot';
import { persistCurrentClassroomForExport } from './persist-before-server-export';
import { addPresentationBrandToSnapshot } from './presentation-brand-snapshot';
import { downloadExport } from './download-export';
import { createLogger } from '@/lib/logger';
import { describeExportStatus, type ExportJobProgress } from './export-progress';

const POLL_INTERVAL_MS = 5000;
/** Un rendu de plusieurs dizaines de scènes dure près d'une heure : l'attente va jusqu'à trois heures. */
const MAX_WAIT_MS = 3 * 60 * 60 * 1000;
/** Des échecs réseau passagers n'interrompent pas le suivi d'un rendu qui, lui, continue côté serveur. */
const MAX_CONSECUTIVE_POLL_FAILURES = 5;
const log = createLogger('ExportMP4');

interface ExportJobResponse {
  success?: boolean;
  id?: string;
  status?: string;
  done?: boolean;
  downloadUrl?: string | null;
  error?: string | null;
  progress?: ExportJobProgress;
  reused?: boolean;
}

export function useExportMp4() {
  const [exporting, setExporting] = useState(false);
  const activeRef = useRef(false);
  const { t } = useI18n();
  const { complete: completeMissingVoices } = useMissingVoices();

  const exportMp4 = useCallback(async (options: { notifyByEmail?: boolean } = {}) => {
    const { stage, scenes } = useStageStore.getState();
    if (!stage?.id || activeRef.current) return;

    activeRef.current = true;
    setExporting(true);
    const toastId = toast.loading(t('export.videoRendering'));
    try {
      if (!guardSpeechAudio(scenes, t, toastId, completeMissingVoices)) return;
      await persistCurrentClassroomForExport();
      let fallbackSnapshotCount = 0;
      const slideCount = scenes.filter((scene) => scene.content?.type === 'slide').length;
      let preparedSlides = 0;
      for (const scene of scenes) {
        if (scene.content?.type !== 'slide') continue;
        toast.loading(t('export.videoPreparing', { done: preparedSlides, total: slideCount }), {
          id: toastId,
        });
        preparedSlides += 1;
        try {
          const snapshot = await slideToPng(scene.content.canvas, {
            width: 1920,
            pixelRatio: 1,
            format: 'blob',
          });
          if (!(snapshot instanceof Blob)) throw new Error('snapshot-not-a-blob');
          const brandedSnapshot = await addPresentationBrandToSnapshot(
            snapshot,
            stage.presentationBranding,
          );
          const upload = await fetch(
            `/api/export-snapshots/${encodeURIComponent(stage.id)}/${encodeURIComponent(scene.id)}`,
            { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: brandedSnapshot },
          );
          if (!upload.ok) throw new Error(`snapshot-upload-${upload.status}`);
        } catch (snapshotError) {
          // The server renderer has a deterministic scene-card fallback. A
          // browser-only capture problem must not prevent the MP4 job from
          // being created, but it remains visible and diagnosable.
          fallbackSnapshotCount += 1;
          log.warn('Snapshot fallback used', {
            sceneId: scene.id,
            error: snapshotError instanceof Error ? snapshotError.message : String(snapshotError),
          });
        }
      }
      if (fallbackSnapshotCount > 0) {
        toast.warning(t('export.videoSnapshotFallback', { count: fallbackSnapshotCount }), {
          id: toastId,
        });
        toast.loading(t('export.videoRendering'), { id: toastId });
      }
      const createResponse = await fetch('/api/export-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: stage.id,
          format: 'mp4',
          notifyByEmail: options.notifyByEmail === true,
        }),
      });
      const created = (await createResponse.json()) as ExportJobResponse;
      if (!createResponse.ok || !created.success || !created.id) {
        throw new Error(created.error || t('export.exportFailed'));
      }

      if (created.reused) toast.loading(t('export.videoResumed'), { id: toastId });
      const startedAt = Date.now();
      let failures = 0;
      while (Date.now() - startedAt < MAX_WAIT_MS) {
        let status: ExportJobResponse | null = null;
        try {
          const statusResponse = await fetch(`/api/export-jobs/${created.id}`);
          status = (await statusResponse.json()) as ExportJobResponse;
          if (!statusResponse.ok || !status.success) {
            throw new Error(status.error || t('export.exportFailed'));
          }
          failures = 0;
        } catch (pollError) {
          failures += 1;
          // Une erreur annoncée par le serveur (échec du rendu) s'arrête tout de suite ; une panne réseau se retente.
          if (status && !status.success) throw pollError;
          if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw pollError;
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          continue;
        }
        if (status.done) {
          if (status.status !== 'done' || !status.downloadUrl) {
            throw new Error(status.error || t('export.exportFailed'));
          }
          await downloadExport(status.downloadUrl, `${stage.name || 'qalem-classroom'}.mp4`);
          toast.success(t('export.videoReady'), { id: toastId });
          return;
        }
        const message = describeExportStatus({
          status: status.status,
          progress: status.progress,
          elapsedMs: Date.now() - startedAt,
        });
        toast.loading(t(message.key, message.values), { id: toastId });
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      throw new Error(t('export.videoTimeout'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('export.exportFailed'), {
        id: toastId,
      });
    } finally {
      activeRef.current = false;
      setExporting(false);
    }
  }, [t, completeMissingVoices]);

  return { exporting, exportMp4 };
}
