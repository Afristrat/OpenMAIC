'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GenerationFailure } from '@/lib/generation/generation-tracking';
import { useI18n } from '@/lib/hooks/use-i18n';

interface SyllabusJob {
  id: string;
  title?: string;
  createdAt: string;
  status: 'queued' | 'running' | 'failed' | 'succeeded';
  approved: boolean;
  failure?: GenerationFailure;
  launch?: { id: string; status: SyllabusJob['status'] };
}

export function MySyllabi({ orgId, modelString }: { orgId: string; modelString: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<SyllabusJob[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryError, setRetryError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ orgId, offset: String(offset) });
    void fetch(`/api/generate-classroom/plan?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to list syllabus jobs');
        const result: { jobs: SyllabusJob[]; nextOffset: number | null } = await response.json();
        setJobs(result.jobs);
        setNextOffset(result.nextOffset);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [open, offset, orgId]);

  function planUrl(id: string) {
    return `/app?${new URLSearchParams({ planJobId: id, orgId })}`;
  }

  async function retry(id: string) {
    setRetrying(id);
    setRetryError(false);
    try {
      const response = await fetch('/api/generate-classroom/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryJobId: id, orgId, modelString }),
      });
      if (!response.ok) throw new Error('Unable to retry syllabus job');
      const { jobId } = await response.json();
      window.location.assign(planUrl(jobId));
    } catch {
      setRetryError(true);
      setRetrying(null);
    }
  }

  function loadPage(page: number) {
    setJobs(null);
    setLoadError(false);
    setOffset(page);
  }

  return (
    <section className="mb-4 w-full max-w-3xl">
      <Button
        variant="outline"
        aria-expanded={open}
        aria-controls="my-syllabi-list"
        onClick={() => {
          loadPage(0);
          setOpen(!open);
        }}
      >
        {t('syllabi.title')}
      </Button>
      {open && (
        <div id="my-syllabi-list" className="mt-3 rounded-lg border bg-card p-4">
          {loadError && <p role="alert">{t('syllabi.loadFailed')}</p>}
          {retryError && <p role="alert">{t('syllabi.retryFailed')}</p>}
          {!jobs && !loadError && <p role="status">{t('syllabi.loading')}</p>}
          {jobs?.length === 0 && <p>{t('syllabi.empty')}</p>}
          {jobs && (
            <ul className="divide-y">
              {jobs.map((job) => {
                const launch = job.launch;
                const launchActive = launch && launch.status !== 'failed';
                const status = launchActive ? 'launched' : job.approved ? 'approved' : job.status;
                return (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {job.title || t('syllabi.untitled')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(job.createdAt))}
                        {' · '}
                        {t(`syllabi.${status}`)}
                      </p>
                      {job.failure && (
                        <p className="text-sm">
                          {t(`generation.failure.${job.failure.code}`, job.failure.params)}
                        </p>
                      )}
                    </div>
                    {job.status === 'failed' ? (
                      <Button
                        variant="outline"
                        disabled={retrying !== null}
                        onClick={() => void retry(job.id)}
                      >
                        {t(retrying === job.id ? 'syllabi.retrying' : 'syllabi.retry')}
                      </Button>
                    ) : (
                      <Button variant="outline" asChild>
                        <a
                          href={
                            launchActive
                              ? `/generation-status?${new URLSearchParams({ jobId: launch.id, planJobId: job.id, orgId })}`
                              : planUrl(job.id)
                          }
                        >
                          {t(
                            launchActive || !['succeeded', 'failed'].includes(job.status)
                              ? 'syllabi.track'
                              : job.approved
                                ? 'syllabi.resumeLaunch'
                                : 'syllabi.review',
                          )}
                        </a>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {(offset > 0 || nextOffset !== null) && jobs && (
            <div className="mt-3 flex gap-2">
              {offset > 0 && (
                <Button variant="outline" onClick={() => loadPage(Math.max(0, offset - 25))}>
                  {t('syllabi.previous')}
                </Button>
              )}
              {nextOffset !== null && (
                <Button variant="outline" onClick={() => loadPage(nextOffset)}>
                  {t('syllabi.next')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
