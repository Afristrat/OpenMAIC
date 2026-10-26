'use client';

import { VoiceWarningNotice } from '@/components/generation/voice-warning-notice';
import { useI18n } from '@/lib/hooks/use-i18n';
import { hasVoiceCasting } from '@/lib/audio/voice-casting-availability';
import { useStageStore } from '@/lib/store/stage';
import { useMissingVoices } from '@/lib/hooks/use-missing-voices';
import { GenerateMissingVoicesButton } from './generate-missing-voices-button';

/**
 * Shown when a course opens with silent speech lines (a generation that kept the course although
 * some voices failed). Everyone reads the counts; only readers allowed to edit get the action.
 */
export function MissingVoicesBanner({ canComplete }: { canComplete: boolean }) {
  const { t } = useI18n();
  const { missing, total, completing, progress, complete } = useMissingVoices();
  const castable = useStageStore((state) => hasVoiceCasting(state.stage));
  if (missing === 0) return null;
  return (
    <div className="px-4 pt-2">
      <VoiceWarningNotice
        missing={missing}
        total={total}
        message={castable ? undefined : t('edit.tts.noCastingNotice', { missing, total })}
        showHint={canComplete && castable}
      >
        {canComplete && castable && (
          <GenerateMissingVoicesButton
            completing={completing}
            progress={progress}
            onClick={() => void complete()}
          />
        )}
      </VoiceWarningNotice>
    </div>
  );
}
