'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { uncoveredEssentials, type PlanCompetencyFramework } from '@/lib/referentiel/plan-coverage';
import type { SceneOutline } from '@/lib/types/generation';
import { cn } from '@/lib/utils';

/**
 * Bilan des compétences du métier visé : chacune est cochée dès qu'une séquence la travaille,
 * et les essentielles encore sans séquence bloquent la validation du programme.
 */
export function CompetencyCoveragePanel({
  framework,
  outlines,
}: {
  framework: PlanCompetencyFramework;
  outlines: SceneOutline[];
}): React.ReactElement {
  const { t } = useI18n();
  const worked = new Set(outlines.flatMap((outline) => outline.competencies ?? []));
  const essential = framework.skills.filter((skill) => skill.nature === 'essentielle');
  const missing = uncoveredEssentials(outlines, framework);
  return (
    <section
      aria-label={t('generation.competencies.title')}
      className="mb-3 rounded-xl border border-border/60 bg-background/60 p-3"
    >
      <h3 className="text-sm font-semibold">{t('generation.competencies.title')}</h3>
      <p className="text-xs text-muted-foreground">
        {t('generation.competencies.occupation', { title: framework.occupation.titleFr })}
      </p>
      <p
        role="status"
        className={cn(
          'mt-1 text-xs font-medium',
          missing.length > 0
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-emerald-700 dark:text-emerald-300',
        )}
      >
        {t('generation.competencies.summary', {
          covered: essential.length - missing.length,
          total: essential.length,
        })}
      </p>
      <ul className="mt-2 grid gap-1 md:grid-cols-2">
        {framework.skills.map((skill) => {
          const isWorked = worked.has(skill.code);
          const isGap = skill.nature === 'essentielle' && !isWorked;
          return (
            <li key={skill.code} className="flex items-start gap-1.5 text-xs">
              {isWorked ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
              ) : isGap ? (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
              ) : (
                <span className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              <span className={cn(isGap && 'font-medium text-amber-800 dark:text-amber-200')}>
                {skill.title}
                <span className="ms-1 text-muted-foreground">
                  ({t(`generation.competencies.${skill.nature}`)})
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {missing.length > 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {t('generation.competencies.missing')}
        </p>
      )}
    </section>
  );
}

/** Pastilles d'une séquence : la personne coche ou décoche les compétences que cette séquence travaille. */
export function SceneCompetencies({
  framework,
  selected,
  disabled,
  index,
  onChange,
}: {
  framework: PlanCompetencyFramework;
  selected: readonly string[];
  disabled: boolean;
  index: number;
  onChange: (codes: string[]) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const toggle = (code: string): void => {
    const next = selected.includes(code)
      ? selected.filter((item) => item !== code)
      : [...selected, code];
    onChange(
      framework.skills.map((skill) => skill.code).filter((candidate) => next.includes(candidate)),
    );
  };
  return (
    <div className="space-y-1 pt-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {t('generation.competencies.scene')}
      </span>
      <div
        role="group"
        aria-label={t('generation.competencies.sceneFor', { index: index + 1 })}
        className="flex flex-wrap gap-1.5"
      >
        {framework.skills.map((skill) => {
          const on = selected.includes(skill.code);
          return (
            <button
              key={skill.code}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(skill.code)}
              className={cn(
                'max-w-full rounded-full border px-2.5 py-1 text-start text-[11px] leading-tight transition-colors disabled:opacity-60',
                on
                  ? 'border-emerald-500/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
                  : 'border-border/60 text-muted-foreground hover:border-blue-400',
              )}
            >
              {on && <Check className="me-1 inline size-3" aria-hidden />}
              {skill.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
