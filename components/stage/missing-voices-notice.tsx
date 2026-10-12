'use client';

import { AlertTriangle, Loader2, Mic } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useMissingVoices } from '@/lib/hooks/use-missing-voices';

/**
 * Says, in the export dialog, that some speech lines have no voice and offers the fix:
 * the MP4 and LMS exports refuse such a course, and that must never be a surprise.
 */
export function MissingVoicesNotice() {
  const { t } = useI18n();
  const { missing, completing, progress, complete } = useMissingVoices();
  if (missing === 0) return null;
  return (
    <div
      role="alert"
      data-testid="missing-voices-notice"
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1 space-y-2">
        <p>{t('edit.tts.missingNotice', { count: missing })}</p>
        <button
          type="button"
          onClick={() => void complete()}
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
      </div>
    </div>
  );
}
