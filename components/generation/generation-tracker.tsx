'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import {
  COURSE_STEPS,
  PLAN_STEPS,
  courseStepPosition,
  formatDuration,
  getLiveness,
  planStepPosition,
  type TrackedKind,
} from '@/lib/generation/generation-tracking';

export interface GenerationTrackerProps {
  kind: TrackedKind;
  status: 'queued' | 'running';
  step?: string;
  startedAt?: string;
  updatedAt?: string;
  /** Server clock at the time of the reading, to ignore any browser clock drift. */
  serverNow?: string;
  typicalDuration?: { lowMs: number; highMs: number };
  scenes?: { done: number; total?: number };
  /** Server-computed completion of the course; the plan has no honest percentage. */
  progress?: number;
}

function useServerClock(serverNow?: string): number {
  const [now, setNow] = useState(() => {
    const server = serverNow ? Date.parse(serverNow) : Number.NaN;
    return Number.isFinite(server) ? server : 0;
  });
  useEffect(() => {
    const server = serverNow ? Date.parse(serverNow) : Number.NaN;
    if (!Number.isFinite(server)) return undefined;
    // Anchor on the server clock so a wrong browser clock never skews the timers.
    const offset = server - Date.now();
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  return now;
}

export function GenerationTracker({
  kind,
  status,
  step,
  startedAt,
  updatedAt,
  serverNow,
  typicalDuration,
  scenes,
  progress,
}: GenerationTrackerProps) {
  const { t } = useI18n();
  const now = useServerClock(serverNow);

  const steps: readonly string[] = kind === 'plan' ? PLAN_STEPS : COURSE_STEPS;
  const position = kind === 'plan' ? planStepPosition(step) : courseStepPosition(step);
  const labels = {
    seconds: (count: number) => t('generation.tracker.seconds', { count }),
    minutes: (count: number) => t('generation.tracker.minutes', { count }),
  };
  const started = startedAt ? Date.parse(startedAt) : Number.NaN;
  const updated = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const elapsed = Number.isFinite(started) ? formatDuration(now - started, labels) : undefined;
  const silentMs = Number.isFinite(updated) ? Math.max(0, now - updated) : 0;
  const liveness = status === 'queued' ? 'active' : getLiveness(silentMs);
  const ago = formatDuration(silentMs, labels);
  const stepLabel = (name: string) => t(`generation.step.${kind}.${name}`);

  return (
    <div className="space-y-4 text-start" data-testid="generation-tracker">
      <p className="text-sm font-medium">
        {status === 'queued'
          ? t('generation.tracker.queued')
          : t('generation.tracker.stepOf', {
              current: position + 1,
              total: steps.length,
              label: stepLabel(step ?? steps[0]),
            })}
      </p>

      <ol className="space-y-1.5">
        {steps.map((name, index) => {
          const done = status === 'running' && index < position;
          const current = status === 'running' && index === position;
          const Icon = done ? CheckCircle2 : current ? Loader2 : Circle;
          return (
            <li
              key={name}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 text-sm',
                current ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon
                className={cn(
                  'size-4 shrink-0',
                  done && 'text-emerald-500',
                  current && 'animate-spin text-primary',
                )}
                aria-hidden
              />
              {stepLabel(name)}
              {current && step === 'correcting_plan' && (
                <span className="text-xs text-muted-foreground">
                  {t('generation.step.plan.correcting_plan')}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {scenes && scenes.done > 0 && (
        <p className="text-sm text-muted-foreground">
          {scenes.total
            ? t('generation.tracker.scenes', { done: scenes.done, total: scenes.total })
            : t('generation.tracker.scenesDone', { done: scenes.done })}
        </p>
      )}

      {kind === 'course' && typeof progress === 'number' && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}

      {elapsed && (
        <p className="text-xs text-muted-foreground">
          {t('generation.tracker.elapsed', { duration: elapsed })}
          {typicalDuration &&
            ` · ${t('generation.tracker.typical', {
              low: formatDuration(typicalDuration.lowMs, labels),
              high: formatDuration(typicalDuration.highMs, labels),
            })}`}
        </p>
      )}

      {status === 'running' && (
        <p
          role="status"
          className={cn(
            'rounded-lg px-3 py-2 text-xs',
            liveness === 'active' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            liveness === 'slow' && 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
            liveness === 'stalled' && 'bg-destructive/10 text-destructive',
          )}
        >
          {liveness === 'active' && t('generation.tracker.liveActive', { ago })}
          {liveness === 'slow' && t('generation.tracker.liveSlow', { ago })}
          {liveness === 'stalled' && t('generation.tracker.liveStalled', { ago })}
        </p>
      )}
    </div>
  );
}
