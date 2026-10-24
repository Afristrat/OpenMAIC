'use client';

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * Says that part of a kept course has no voice. Shared by the generation status screen and the
 * open course; the text carries the information, the amber colour only reinforces it.
 */
export function VoiceWarningNotice({
  missing,
  total,
  showHint,
  children,
}: {
  missing: number;
  total: number;
  /** Tells where to regenerate the voices: only for readers who can do it. */
  showHint: boolean;
  /** The action, when the reader may use it. */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      data-testid="voice-warning-notice"
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-start text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1 space-y-2">
        <p>
          <span className="font-medium">{t('edit.tts.partialNotice', { missing, total })}</span>
          {showHint && <> {t('edit.tts.partialHint')}</>}
        </p>
        {children}
      </div>
    </div>
  );
}
