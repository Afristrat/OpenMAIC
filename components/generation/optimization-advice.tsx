'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import {
  optimizationReportSchema,
  type OptimizationReport,
} from '@/lib/generation/optimization-report';
import type { SceneOutline } from '@/lib/types/generation';

export function OptimizationAdvice({
  report,
  outlines,
}: {
  report: OptimizationReport;
  outlines: SceneOutline[];
}) {
  const { t, locale } = useI18n();
  const parsed = optimizationReportSchema.safeParse(report);
  if (!parsed.success) return null;
  const data = parsed.data;
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const matched =
    data.recommendedSceneOrder.length === outlines.length &&
    data.recommendedSceneOrder.every((type, index) => type === outlines[index].type);
  const typeKeys = {
    slide: 'generation.sceneTypeSlide',
    quiz: 'generation.sceneTypeQuiz',
    interactive: 'generation.sceneTypeInteractive',
    pbl: 'generation.sceneTypePbl',
    plugin: 'generation.sceneTypePlugin',
  } as const;
  return (
    <section
      data-testid="optimization-advice"
      aria-label={t('generation.optimizationTitle')}
      className="mx-auto my-3 w-full max-w-5xl space-y-2 rounded-lg border p-4 text-sm"
    >
      <h3 className="font-semibold">{t('generation.optimizationTitle')}</h3>
      <p>
        {t('generation.optimizationEvidence', {
          count: data.sampleSize,
          selected: data.selectedSequenceSampleSize,
          score: percent.format(data.observedMeanQuizScore),
          selectedScore: percent.format(data.selectedSequenceMeanQuizScore),
        })}
      </p>
      <p>
        {t('generation.optimizationSequence')}{' '}
        {data.recommendedSceneOrder.map((type) => t(typeKeys[type])).join(' · ')}
      </p>
      <p>
        {t('generation.optimizationDifficulty', {
          value: new Intl.NumberFormat(locale, {
            signDisplay: 'always',
            maximumFractionDigits: 2,
          }).format(data.difficultyModifier),
        })}
      </p>
      <p data-testid="optimization-sequence-status">
        {t(matched ? 'generation.optimizationMatched' : 'generation.optimizationDifferent')}
      </p>
      <p className="text-muted-foreground">{t('generation.optimizationLimits')}</p>
    </section>
  );
}
