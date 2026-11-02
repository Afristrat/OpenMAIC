'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SceneCoherenceReport } from '@/lib/export/coherence';

type Report = {
  reports: SceneCoherenceReport[];
  counts: Record<SceneCoherenceReport['verdict'], number>;
  blocking: SceneCoherenceReport[];
};

const VERDICT_STYLE: Record<SceneCoherenceReport['verdict'], string> = {
  coherent: 'text-emerald-700 dark:text-emerald-400',
  partial: 'text-amber-700 dark:text-amber-400',
  incoherent: 'text-destructive',
  unverified: 'text-muted-foreground',
  unreadable: 'text-muted-foreground',
};

/** Contrôle de cohérence voix off / image d'une formation, avec le rapport du dernier contrôle. */
export function CoherenceCheck({ courseId }: { courseId: string }) {
  const { t } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = `/api/courses/${encodeURIComponent(courseId)}/coherence`;

  useEffect(() => {
    let active = true;
    void fetch(url, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { report?: Report | null };
        if (active) setReport(payload.report ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [url]);

  const run = async () => {
    setFailed(false);
    setRunning(true);
    try {
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) throw new Error('Coherence request failed');
      setReport((await response.json()) as Report);
    } catch {
      setFailed(true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-4 border-t pt-4" data-testid="coherence-check">
      <h4 className="text-sm font-semibold">{t('coherence.title')}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{t('coherence.description')}</p>
      <button
        type="button"
        className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'mt-3 w-full')}
        disabled={running}
        onClick={() => void run()}
      >
        {running ? t('coherence.running') : report ? t('coherence.rerun') : t('coherence.run')}
      </button>
      {failed && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {t('coherence.failed')}
        </p>
      )}
      {report && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="font-medium">
            {t('coherence.summary', {
              coherent: report.counts.coherent,
              partial: report.counts.partial,
              incoherent: report.counts.incoherent,
            })}
          </p>
          {report.blocking.length > 0 && (
            <p className="text-xs text-destructive" role="alert">
              {t('coherence.blocking')}
            </p>
          )}
          {report.counts.unverified > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('coherence.unverifiedHint', { count: report.counts.unverified })}
            </p>
          )}
          <ul className="space-y-2">
            {report.reports
              .filter((scene) => scene.verdict !== 'coherent')
              .map((scene) => (
                <li key={scene.sceneId} className="rounded-lg border p-2">
                  <p className="text-xs font-semibold">
                    {scene.title || scene.sceneId}
                    <span className={cn('ms-2', VERDICT_STYLE[scene.verdict])}>
                      {t(`coherence.verdict.${scene.verdict}`)}
                    </span>
                  </p>
                  {scene.problems.map((problem) => (
                    <p key={problem.quote} className="mt-1 text-xs text-muted-foreground">
                      « {problem.quote} » : {problem.reason}
                    </p>
                  ))}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
