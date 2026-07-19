'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 360;

interface ExportJobResponse {
  success?: boolean;
  id?: string;
  status?: string;
  done?: boolean;
  downloadUrl?: string | null;
  error?: string | null;
}

function downloadFile(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function useExportMp4() {
  const [exporting, setExporting] = useState(false);
  const activeRef = useRef(false);
  const { t } = useI18n();

  const exportMp4 = useCallback(async () => {
    const { stage } = useStageStore.getState();
    if (!stage?.id || activeRef.current) return;

    activeRef.current = true;
    setExporting(true);
    const toastId = toast.loading(t('export.videoRendering'));
    try {
      const createResponse = await fetch('/api/export-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: stage.id, format: 'mp4' }),
      });
      const created = (await createResponse.json()) as ExportJobResponse;
      if (!createResponse.ok || !created.success || !created.id) {
        throw new Error(created.error || t('export.exportFailed'));
      }

      for (let poll = 0; poll < MAX_POLLS; poll++) {
        const statusResponse = await fetch(`/api/export-jobs/${created.id}`);
        const status = (await statusResponse.json()) as ExportJobResponse;
        if (!statusResponse.ok || !status.success) {
          throw new Error(status.error || t('export.exportFailed'));
        }
        if (status.done) {
          if (status.status !== 'done' || !status.downloadUrl) {
            throw new Error(status.error || t('export.exportFailed'));
          }
          downloadFile(status.downloadUrl, `${stage.name || 'qalem-classroom'}.mp4`);
          toast.success(t('export.videoReady'), { id: toastId });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      throw new Error(t('export.videoTimeout'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('export.exportFailed'), { id: toastId });
    } finally {
      activeRef.current = false;
      setExporting(false);
    }
  }, [t]);

  return { exporting, exportMp4 };
}
