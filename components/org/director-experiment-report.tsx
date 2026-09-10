'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { buildDirectorExperimentReport } from '@/lib/orchestration/director-experiment-report';
import { Button } from '@/components/ui/button';

type Report = ReturnType<typeof buildDirectorExperimentReport>;
const counters = [
  'assignedUnits',
  'unitsWithQuiz',
  'missingQuizUnits',
  'unitsWithReportedTurns',
  'decisions',
  'selections',
  'suggestionSelections',
  'changedSelections',
  'completedGenerations',
  'failedGenerations',
  'emptyGenerations',
  'abortedGenerations',
  'pendingGenerations',
  'linkedTurns',
] as const;

/** Parent keys this component by tenant and stage: old requests cannot render in a new scope. */
export function DirectorExperimentReport({
  orgId,
  stageId,
  stageName,
}: {
  orgId: string;
  stageId: string;
  stageName: string;
}) {
  const { t, locale } = useI18n();
  const [result, setResult] = useState<Report | 'failed' | 'denied' | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(orgId)}/director-experiment?${new URLSearchParams({ stageId })}`,
          {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
            cache: 'no-store',
          },
        );
        if (response.status === 403) {
          if (!controller.signal.aborted) setResult('denied');
          return;
        }
        if (!response.ok) throw new Error('Report unavailable');
        const body = await response.json();
        if (
          body?.experiment !== 'qalem-director-v1' ||
          body.unit !== 'learner-organization-classroom' ||
          body.outcome !== 'first-submitted-linked-native-quiz' ||
          body.evidence !== 'observational'
        )
          throw new Error('Invalid report');
        const report = buildDirectorExperimentReport(body.cohorts);
        if (!controller.signal.aborted) setResult(report);
      } catch {
        if (!controller.signal.aborted) setResult('failed');
      }
    })();
    return () => controller.abort();
  }, [orgId, stageId, revision]);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  return (
    <section className="mb-8 rounded-lg border p-4" aria-labelledby="director-report-title">
      <h2 id="director-report-title" className="text-lg font-semibold">
        {t('directorReport.title')}
      </h2>
      <p className="mt-2 font-medium">{stageName}</p>
      <Button
        variant="outline"
        className="mt-3 print:hidden"
        disabled={result === null}
        onClick={() => {
          setResult(null);
          setRevision((value) => value + 1);
        }}
      >
        {t('directorReport.refresh')}
      </Button>
      <p className="my-3 text-sm">{t('directorReport.limits')}</p>
      <p className="my-3 text-sm">{t('directorReport.scope')}</p>
      <div aria-live="polite">
        {result === null ? (
          <p>{t('common.loading')}</p>
        ) : typeof result === 'string' ? (
          <p role="alert">{t(`directorReport.${result}`)}</p>
        ) : result.cohorts.length === 0 ? (
          <p>{t('directorReport.empty')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('directorReport.title')}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="p-2 text-start">
                      {t('directorReport.measure')}
                    </th>
                    {result.cohorts.map((row) => (
                      <th
                        scope="col"
                        className="p-2 text-start"
                        key={`${row.cohort}:${row.language}`}
                      >
                        {t(`directorReport.${row.cohort}`)} ·{' '}
                        {row.language ?? t('directorReport.unknownLanguage')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {counters.map((key) => (
                    <tr key={key} className="border-t">
                      <th scope="row" className="p-2 text-start font-normal">
                        {t(`directorReport.${key}`)}
                      </th>
                      {result.cohorts.map((row) => (
                        <td className="p-2" key={`${row.cohort}:${row.language}`}>
                          {number.format(row[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t">
                    <th scope="row" className="p-2 text-start font-normal">
                      {t('directorReport.meanQuizScore')}
                    </th>
                    {result.cohorts.map((row) => (
                      <td className="p-2" key={`${row.cohort}:${row.language}`}>
                        {row.meanQuizScore === null ? '—' : percent.format(row.meanQuizScore)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t">
                    <th scope="row" className="p-2 text-start font-normal">
                      {t('directorReport.meanLookupMs')}
                    </th>
                    {result.cohorts.map((row) => (
                      <td className="p-2" key={`${row.cohort}:${row.language}`}>
                        {row.meanLookupMs === null ? '—' : number.format(row.meanLookupMs)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="mt-4 font-medium">{t('directorReport.difference')}</h3>
            <ul>
              {result.comparisons.map((row) => (
                <li key={row.language}>
                  {row.language} :{' '}
                  {row.meanScoreDifference === null
                    ? '—'
                    : number.format(row.meanScoreDifference * 100)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
