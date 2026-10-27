'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import type { ClassroomPlan, SceneOutline } from '@/lib/types/generation';

function sceneTypeKey(type: SceneOutline['type']): string {
  switch (type) {
    case 'quiz':
      return 'generation.sceneTypeQuiz';
    case 'interactive':
      return 'generation.sceneTypeInteractive';
    case 'pbl':
      return 'generation.sceneTypePbl';
    case 'plugin':
      return 'nav.plugins';
    case 'slide':
    default:
      return 'generation.sceneTypeSlide';
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-neutral-600">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-6 text-foreground print:text-black">{children}</dd>
    </div>
  );
}

/** Programme lisible et imprimable : même rendu à l'écran et dans le PDF produit par l'impression. */
export function ProgrammeDocument({ plan }: { plan: ClassroomPlan }) {
  const { t } = useI18n();
  const { syllabus } = plan;
  const outlines = [...plan.outlines].sort((a, b) => a.order - b.order);

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-6 py-8 print:max-w-none print:space-y-6 print:px-0 print:py-0">
      <header className="space-y-2 border-b border-border pb-5 print:border-neutral-400">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground print:text-neutral-600">
          {t('programme.title')}
        </p>
        <h1 className="text-3xl font-semibold leading-tight text-foreground print:text-black">
          {plan.courseTitle}
        </h1>
      </header>

      <dl className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
        <Field label={t('programme.audience')}>{syllabus.audience}</Field>
        <Field label={t('programme.prerequisites')}>{syllabus.prerequisites}</Field>
        <Field label={t('programme.duration')}>
          {t('programme.durationValue', { minutes: syllabus.totalDurationMinutes })}
        </Field>
        <Field label={t('programme.deliveryMode')}>{syllabus.deliveryMode}</Field>
      </dl>

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-semibold text-foreground print:text-black">
          {t('programme.overallObjective')}
        </h2>
        <p className="text-sm leading-6 text-foreground print:text-black">
          {syllabus.overallObjective}
        </p>
      </section>

      <section className="space-y-2 break-inside-avoid">
        <h2 className="text-lg font-semibold text-foreground print:text-black">
          {t('programme.learningObjectives')}
        </h2>
        <ul className="list-disc space-y-1 ps-5 text-sm leading-6 text-foreground print:text-black">
          {syllabus.learningObjectives.map((objective, index) => (
            <li key={`${index}-${objective}`}>{objective}</li>
          ))}
        </ul>
      </section>

      <dl className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
        <Field label={t('programme.assessmentStrategy')}>{syllabus.assessmentStrategy}</Field>
        <Field label={t('programme.expectedDeliverable')}>{syllabus.expectedDeliverable}</Field>
      </dl>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground print:text-black">
          {t('programme.sequence')}
        </h2>
        <ol className="space-y-4">
          {outlines.map((outline) => (
            <li
              key={outline.id}
              className="break-inside-avoid rounded-lg border border-border p-4 print:border-neutral-400"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground print:text-black">
                  {outline.order}. {outline.title}
                </h3>
                <span className="text-xs text-muted-foreground print:text-neutral-600">
                  {t(sceneTypeKey(outline.type))}
                  {outline.estimatedDuration
                    ? ` · ${t('programme.durationValue', {
                        minutes: Math.max(1, Math.round(outline.estimatedDuration / 60)),
                      })}`
                    : ''}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground print:text-black">
                {outline.description}
              </p>
              {outline.teachingObjective && (
                <p className="mt-2 text-sm italic leading-6 text-muted-foreground print:text-neutral-700">
                  {outline.teachingObjective}
                </p>
              )}
              {outline.keyPoints.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-neutral-600">
                    {t('programme.keyPoints')}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm leading-6 text-foreground print:text-black">
                    {outline.keyPoints.map((point, index) => (
                      <li key={`${index}-${point}`}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
