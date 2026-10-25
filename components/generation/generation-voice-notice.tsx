'use client';

import { VoiceWarningNotice } from '@/components/generation/voice-warning-notice';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { LiveVoiceState } from '@/lib/generation/voice-warning';

/**
 * The voice message of the generation status screen. It states only what the saved course says
 * now: nothing when every line is voiced, the real count when some are not, and a neutral text
 * without figure when the course could not be read. It never points to a button this screen lacks.
 */
export function GenerationVoiceNotice({ state }: { state: LiveVoiceState }) {
  const { t } = useI18n();
  if (state.kind === 'voiced' || state.kind === 'pending') return null;
  const hint = <p>{t('generation.voiceRegenerateFromCourse')}</p>;
  return state.kind === 'missing' ? (
    <VoiceWarningNotice missing={state.missing} total={state.total} showHint={false}>
      {hint}
    </VoiceWarningNotice>
  ) : (
    <VoiceWarningNotice message={t('generation.voiceStateUnknown')} showHint={false}>
      {hint}
    </VoiceWarningNotice>
  );
}
