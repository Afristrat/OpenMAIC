'use client';

import { Loader2, Mic } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { MissingVoicesProgress } from '@/lib/audio/complete-missing-voices';

/** The one action that fixes silent speech lines, shared by the export dialog and the course banner. */
export function GenerateMissingVoicesButton({
  completing,
  progress,
  onClick,
}: {
  completing: boolean;
  progress: MissingVoicesProgress | null;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={completing}
      data-testid="generate-missing-voices"
      className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {completing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Mic className="h-3.5 w-3.5" aria-hidden />
      )}
      {completing && progress
        ? t('edit.tts.completing', { done: progress.done, total: progress.total })
        : t('edit.tts.generateMissing')}
    </button>
  );
}
