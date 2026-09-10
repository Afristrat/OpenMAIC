'use client';

import type { DirectorObservation } from '@/lib/orchestration/observed-director';
import { useI18n } from '@/lib/hooks/use-i18n';

export function DirectorObservationNotice({
  observation,
  agentName,
}: {
  observation: DirectorObservation;
  agentName: string;
}) {
  const { t, locale } = useI18n();
  const suggestion = observation.suggestion;
  const valid =
    observation.cohort === 'data-driven' &&
    observation.reason === 'observed-pattern' &&
    suggestion &&
    Number.isSafeInteger(suggestion.sampleSize) &&
    suggestion.sampleSize > 0 &&
    Number.isFinite(suggestion.observedMeanQuizScore) &&
    suggestion.observedMeanQuizScore >= 0 &&
    suggestion.observedMeanQuizScore <= 1;
  return (
    <aside
      data-testid="director-observation"
      className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-start text-xs space-y-1"
    >
      <p className="font-semibold">{t('chat.directorChoice', { agent: agentName })}</p>
      {valid ? (
        <>
          <p>
            {t('chat.directorEvidence', {
              count: new Intl.NumberFormat(locale).format(suggestion.sampleSize),
              score: new Intl.NumberFormat(locale, {
                style: 'percent',
                maximumFractionDigits: 1,
              }).format(suggestion.observedMeanQuizScore),
            })}
          </p>
          <p>{t('chat.directorLimits')}</p>
        </>
      ) : (
        <p>
          {t(observation.cohort === 'classic' ? 'chat.directorControl' : 'chat.directorFallback')}
        </p>
      )}
    </aside>
  );
}
