'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Plug, RotateCcw, X } from 'lucide-react';
import { z } from 'zod';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { detectExtension, pairExtension, type ExtensionStatus } from '@/lib/capture/bridge-client';
import { ExtensionInstall } from '@/components/captures/extension-install';
import { cn } from '@/lib/utils';

const reviewSchema = z.enum(['pending', 'approved', 'rejected']);
type Review = z.infer<typeof reviewSchema>;

const courseListSchema = z.object({
  courses: z.array(
    z.object({ id: z.uuid(), title: z.string(), sessionCount: z.number().int().min(0) }),
  ),
});
const detailSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.uuid(),
      domain: z.string(),
      capturedAt: z.string(),
      status: z.string(),
      replaced: z.boolean(),
      steps: z.array(
        z.object({
          id: z.uuid(),
          position: z.number().int(),
          action: z.string(),
          url: z.string(),
          element: z.object({ label: z.string().optional() }).nullable(),
          description: z.string(),
          review: reviewSchema,
          hasScreenshot: z.boolean(),
        }),
      ),
    }),
  ),
});
const codeSchema = z.object({ code: z.string().min(1) });

type Detail = z.infer<typeof detailSchema>;
type CourseItem = z.infer<typeof courseListSchema>['courses'][number];
type PairState = 'idle' | 'working' | 'done' | 'failed';

export default function CapturesPage(): React.ReactElement {
  const { t, locale } = useI18n();
  const { isLoading: authLoading } = useAuth();
  const { currentOrg } = useOrganizations();
  const router = useRouter();

  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [courseId, setCourseId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [extension, setExtension] = useState<ExtensionStatus | null>(null);
  const [pairState, setPairState] = useState<PairState>('idle');
  const [planning, setPlanning] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/capture/courses', { cache: 'no-store' });
      if (!response.ok) throw new Error('Courses unavailable');
      const parsed = courseListSchema.parse(await response.json());
      setCourses(parsed.courses);
      const wanted = new URLSearchParams(window.location.search).get('course');
      setCourseId(
        (current) =>
          current ||
          parsed.courses.find((course) => course.id === wanted)?.id ||
          parsed.courses.find((course) => course.sessionCount > 0)?.id ||
          '',
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setActionError(false);
    try {
      const response = await fetch(`/api/capture/courses/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Captures unavailable');
      setDetail(detailSchema.parse(await response.json()));
    } catch {
      setDetail(null);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) void loadCourses();
  }, [authLoading, loadCourses]);

  useEffect(() => {
    if (courseId) void loadDetail(courseId);
  }, [courseId, loadDetail]);

  useEffect(() => {
    let active = true;
    void detectExtension().then((status) => {
      if (active) setExtension(status);
    });
    return () => {
      active = false;
    };
  }, []);

  const pair = async (): Promise<void> => {
    setPairState('working');
    try {
      const response = await fetch('/api/capture/pairing-codes', { method: 'POST' });
      if (!response.ok) throw new Error('Pairing code refused');
      const { code } = codeSchema.parse(await response.json());
      const result = await pairExtension(code);
      setPairState(result.ok ? 'done' : 'failed');
      if (result.ok) setExtension(await detectExtension());
    } catch {
      setPairState('failed');
    }
  };

  const review = async (stepId: string, value: Review): Promise<void> => {
    setActionError(false);
    try {
      const response = await fetch(`/api/capture/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review: value }),
      });
      if (!response.ok) throw new Error('Review refused');
      setDetail((previous) =>
        previous
          ? {
              sessions: previous.sessions.map((session) => ({
                ...session,
                steps: session.steps.map((step) =>
                  step.id === stepId ? { ...step, review: value } : step,
                ),
              })),
            }
          : previous,
      );
    } catch {
      setActionError(true);
    }
  };

  const approvedCount =
    detail?.sessions
      .filter((session) => !session.replaced && session.status === 'complete')
      .reduce(
        (total, session) => total + session.steps.filter((s) => s.review === 'approved').length,
        0,
      ) ?? 0;

  const plan = async (): Promise<void> => {
    if (!currentOrg || !courseId) return;
    setPlanning(true);
    setActionError(false);
    try {
      const response = await fetch(`/api/capture/courses/${courseId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: currentOrg.id }),
      });
      if (!response.ok) throw new Error('Attach refused');
      router.push(`/app?captureCourseId=${courseId}`);
    } catch {
      setActionError(true);
      setPlanning(false);
    }
  };

  const extensionLabel = !extension
    ? t('captures.extension.checking')
    : extension.state === 'absent'
      ? t('captures.extension.absent')
      : extension.state === 'outdated'
        ? t('captures.extension.outdated', { version: extension.version })
        : extension.paired
          ? t('captures.extension.paired', { version: extension.version })
          : t('captures.extension.present', { version: extension.version });

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="flex-1 space-y-8 px-6 py-8 lg:px-12">
        <header>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('captures.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
            {t('captures.subtitle')}
          </p>
        </header>

        <section
          aria-labelledby="captures-extension"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center gap-3">
            <Plug className="size-5 text-purple-600" aria-hidden />
            <div>
              <h2
                id="captures-extension"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                {t('captures.extension.title')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
                {extensionLabel}
              </p>
            </div>
          </div>
          {extension && extension.state !== 'absent' && (
            <div className="flex items-center gap-3">
              {pairState === 'failed' && (
                <span role="alert" className="text-sm text-red-600">
                  {t('captures.pair.failed')}
                </span>
              )}
              {pairState === 'done' && (
                <span role="status" className="text-sm text-green-700">
                  {t('captures.pair.done')}
                </span>
              )}
              <button
                type="button"
                onClick={() => void pair()}
                disabled={pairState === 'working'}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {extension.paired ? t('captures.pair.again') : t('captures.pair.button')}
              </button>
            </div>
          )}
        </section>

        <ExtensionInstall status={extension} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center py-20 text-center">
            <AlertCircle className="mb-4 size-10 text-red-500" />
            <p className="mb-5 text-base text-gray-600 dark:text-gray-300">
              {t('captures.loadError')}
            </p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                void loadCourses();
                if (courseId) void loadDetail(courseId);
              }}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              {t('captures.retry')}
            </button>
          </div>
        ) : courses.length === 0 ? (
          <p className="py-20 text-center text-base text-gray-500 dark:text-gray-400">
            {t('captures.noProjects')}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('captures.project')}
                <select
                  value={courseId}
                  onChange={(event) => {
                    setDetail(null);
                    setCourseId(event.target.value);
                  }}
                  className="mt-1 block w-72 max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="" disabled>
                    {t('captures.projectPlaceholder')}
                  </option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title} ({course.sessionCount})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void plan()}
                disabled={approvedCount === 0 || planning || !currentOrg}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {t('captures.plan', { n: String(approvedCount) })}
              </button>
            </div>

            {actionError && (
              <p role="alert" className="text-sm text-red-600">
                {t('captures.actionError')}
              </p>
            )}

            {detail && detail.sessions.length === 0 && (
              <p className="py-10 text-center text-base text-gray-500 dark:text-gray-400">
                {t('captures.noSessions')}
              </p>
            )}

            {detail?.sessions.map((session) => (
              <section
                key={session.id}
                aria-label={session.domain}
                className={cn(
                  'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900',
                  session.replaced && 'opacity-60',
                )}
              >
                <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {session.domain}
                  <span className="font-normal text-gray-500">
                    {new Date(session.capturedAt).toLocaleString(locale, {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    })}
                  </span>
                  {session.replaced && (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium dark:bg-gray-800">
                      {t('captures.replaced')}
                    </span>
                  )}
                  {session.status !== 'complete' && (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                      {t('captures.incomplete')}
                    </span>
                  )}
                </h2>
                <ol className="space-y-3">
                  {session.steps.map((step, index) => (
                    <li
                      key={step.id}
                      className="flex flex-wrap items-start gap-4 border-t border-gray-100 pt-3 first:border-0 first:pt-0 dark:border-gray-800"
                    >
                      {step.hasScreenshot && (
                        // eslint-disable-next-line @next/next/no-img-element -- redirection signée vers un bucket privé
                        <img
                          src={`/api/capture/screenshots/${step.id}`}
                          alt={t('captures.screenshotAlt', { n: String(index + 1) })}
                          loading="lazy"
                          className="h-24 w-40 rounded border border-gray-200 object-cover object-top dark:border-gray-700"
                        />
                      )}
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {index + 1}. {t(`captures.action.${step.action}`)}
                          {step.element?.label ? ` : ${step.element.label}` : ''}
                        </p>
                        <p dir="ltr" className="truncate text-xs text-gray-500">
                          {step.url}
                        </p>
                        {step.description && (
                          <p className="mt-1 text-gray-600 dark:text-gray-300">
                            {step.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500" role="status">
                          {t(`captures.review.${step.review}`)}
                        </span>
                        <button
                          type="button"
                          aria-label={t('captures.approve')}
                          aria-pressed={step.review === 'approved'}
                          onClick={() => void review(step.id, 'approved')}
                          className={cn(
                            'rounded-lg border p-2',
                            step.review === 'approved'
                              ? 'border-green-600 bg-green-50 text-green-700'
                              : 'border-gray-300 text-gray-600 dark:border-gray-700',
                          )}
                        >
                          <Check className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={t('captures.reject')}
                          aria-pressed={step.review === 'rejected'}
                          onClick={() => void review(step.id, 'rejected')}
                          className={cn(
                            'rounded-lg border p-2',
                            step.review === 'rejected'
                              ? 'border-red-600 bg-red-50 text-red-700'
                              : 'border-gray-300 text-gray-600 dark:border-gray-700',
                          )}
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                        {step.review !== 'pending' && (
                          <button
                            type="button"
                            aria-label={t('captures.reset')}
                            onClick={() => void review(step.id, 'pending')}
                            className="rounded-lg border border-gray-300 p-2 text-gray-600 dark:border-gray-700"
                          >
                            <RotateCcw className="size-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
