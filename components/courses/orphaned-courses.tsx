'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

const courseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: z.string(),
  status: z.enum(['draft', 'ready', 'archived']),
  stage_id: z.string().nullable(),
  owned: z.boolean().default(false),
});
const listSchema = z.object({
  courses: z.array(courseSchema),
  nextCursor: z.string().uuid().nullable(),
});
const reclaimSchema = z.object({
  courseId: z.string().uuid(),
  sourceManifestId: z.string().uuid().nullable(),
});

export function OrphanedCourses({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const [courses, setCourses] = useState<z.infer<typeof courseSchema>[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reclaimed, setReclaimed] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (after?: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      try {
        const query = new URLSearchParams({ orgId, ...(after ? { after } : {}) });
        const response = await fetch(`/api/courses/orphaned?${query}`, {
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error('Unavailable');
        const data = listSchema.parse(await response.json());
        if (signal?.aborted) return;
        setCourses((previous) =>
          after
            ? [
                ...previous,
                ...data.courses.filter((course) => !previous.some((item) => item.id === course.id)),
              ]
            : data.courses,
        );
        setCursor(data.nextCursor);
      } catch {
        if (!signal?.aborted) setError(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void load(undefined, abort.signal);
    return () => abort.abort();
  }, [load]);

  async function reclaim(id: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(id);
    setError(false);
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(id)}/reclaim`, {
        method: 'POST',
        signal: controller.current?.signal,
      });
      if (!response.ok) throw new Error('Unconfirmed');
      const data = reclaimSchema.parse(await response.json());
      if (data.courseId !== id) throw new Error('Unexpected course');
      setReclaimed((previous) => [...previous, id]);
    } catch {
      if (!controller.current?.signal.aborted) setError(true);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  return (
    <section className="mt-12 border-t pt-10" aria-label={t('catalog.orphanedTitle')}>
      <h2 className="text-xl font-semibold">{t('catalog.orphanedTitle')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('catalog.orphanedDescription')}</p>
      {error && (
        <p role="alert" className="mt-3 text-destructive">
          {t('catalog.reclaimFailed')}
        </p>
      )}
      {!loading && !error && courses.length === 0 && (
        <p className="mt-3">{t('catalog.noOrphaned')}</p>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <article key={course.id} className="rounded-2xl border bg-card p-5">
            <h3 className="font-semibold">{course.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.language} · {t(`catalog.courseStatus.${course.status}`)}
            </p>
            {course.owned || reclaimed.includes(course.id) ? (
              <p role="status" className="mt-3">
                {t('catalog.reclaimed')}
              </p>
            ) : (
              <Button
                className="mt-4"
                disabled={pending !== null}
                onClick={() => void reclaim(course.id)}
              >
                {pending === course.id ? t('catalog.reclaiming') : t('catalog.reclaim')}
              </Button>
            )}
            {course.status === 'ready' && course.stage_id && (
              <a
                className="mt-3 block underline"
                href={`/classroom/${encodeURIComponent(course.stage_id)}`}
              >
                {t('catalog.openClassroom')}
              </a>
            )}
            {course.status === 'draft' && (course.owned || reclaimed.includes(course.id)) && (
              <a
                className="mt-3 block underline"
                href={`/app?resumeCourseId=${course.id}&resumeOrgId=${orgId}`}
              >
                {t('catalog.resume')}
              </a>
            )}
          </article>
        ))}
      </div>
      {loading && (
        <p role="status" className="mt-3">
          {t('common.loading')}
        </p>
      )}
      {!loading && (cursor || error) && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => void load(cursor ?? undefined, controller.current?.signal)}
        >
          {t('catalog.loadOrphaned')}
        </Button>
      )}
    </section>
  );
}
