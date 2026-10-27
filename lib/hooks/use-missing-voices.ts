'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import {
  completeMissingVoices,
  voiceCompletionErrorKey,
  type MissingVoicesProgress,
} from '@/lib/audio/complete-missing-voices';
import { summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import { persistCurrentClassroomForExport } from '@/lib/export/persist-before-server-export';

/**
 * The speech lines of the open course that have no voice, and the one action that fixes them.
 * Shared by the export dialog, the export guards and the playback failure message.
 */
export function useMissingVoices() {
  const { t } = useI18n();
  const scenes = useStageStore((state) => state.scenes);
  const [completing, setCompleting] = useState(false);
  const [progress, setProgress] = useState<MissingVoicesProgress | null>(null);
  const activeRef = useRef(false);
  const report = useMemo(() => summarizeSpeechAudio(scenes), [scenes]);
  const { missing, speech: total } = report;

  const complete = useCallback(async (): Promise<boolean> => {
    if (activeRef.current) return false;
    const { stage, scenes: current } = useStageStore.getState();
    if (!stage?.id) return false;
    activeRef.current = true;
    setCompleting(true);
    const toastId = toast.loading(t('edit.tts.completing', { done: 0, total: missing }));
    try {
      // The server completes the saved course: the local edits must be saved first.
      await persistCurrentClassroomForExport();
      const result = await completeMissingVoices(stage.id, current, (next) => {
        setProgress(next);
        toast.loading(t('edit.tts.completing', { done: next.done, total: next.total }), {
          id: toastId,
        });
      });
      for (const updated of result.updatedScenes) {
        useStageStore.getState().updateScene(updated.id, { actions: updated.actions });
      }
      if (result.failed > 0) {
        toast.warning(
          t('edit.tts.completedPartial', { generated: result.generated, failed: result.failed }),
          { id: toastId, duration: 12_000 },
        );
        return false;
      }
      toast.success(t('edit.tts.completed', { count: result.generated }), { id: toastId });
      return true;
    } catch (error) {
      toast.error(t(voiceCompletionErrorKey(error instanceof Error ? error.message : '')), {
        id: toastId,
        duration: 12_000,
      });
      return false;
    } finally {
      activeRef.current = false;
      setCompleting(false);
      setProgress(null);
    }
  }, [missing, t]);

  return { missing, total, completing, progress, complete };
}
