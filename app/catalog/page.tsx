'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Languages } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CatalogCourse {
  id: string;
  title: string;
  language: string;
  classroomId: string;
  createdAt: string;
}

export default function CatalogPage() {
  const { t, locale } = useI18n();
  const { currentOrg, isAdmin, isLoading: organizationsLoading } = useOrganizations();
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [unpublished, setUnpublished] = useState<CatalogCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [publishingCourseId, setPublishingCourseId] = useState<string | null>(null);
  const [publicationError, setPublicationError] = useState(false);

  useEffect(() => {
    if (organizationsLoading) return;
    if (!currentOrg) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setUnavailable(false);
    const query = new URLSearchParams({ orgId: currentOrg.id });
    if (isAdmin) query.set('includeUnpublished', 'true');
    void fetch(`/api/courses/catalog?${query.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 404) {
          if (active) setUnavailable(true);
          return;
        }
        if (!response.ok) throw new Error('Catalog request failed');
        const payload = (await response.json()) as {
          courses?: CatalogCourse[];
          unpublished?: CatalogCourse[];
        };
        if (active) {
          setCourses(payload.courses ?? []);
          setUnpublished(payload.unpublished ?? []);
        }
      })
      .catch(() => {
        if (active) setUnavailable(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentOrg, isAdmin, organizationsLoading]);

  const publishCourse = async (course: CatalogCourse) => {
    if (!currentOrg) return;
    setPublicationError(false);
    setPublishingCourseId(course.id);
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.id)}/publication`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: currentOrg.id, visible: true }),
      });
      if (!response.ok) throw new Error('Publication request failed');
      setUnpublished((previous) => previous.filter((item) => item.id !== course.id));
      setCourses((previous) => [course, ...previous]);
    } catch {
      setPublicationError(true);
    } finally {
      setPublishingCourseId(null);
    }
  };

  if (loading || organizationsLoading) {
    return <main className="mx-auto max-w-6xl px-6 py-16">{t('common.loading')}</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          {t('catalog.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('catalog.title')}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t('catalog.description')}</p>
      </header>

      {!currentOrg ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          {t('catalog.noOrganization')}
        </div>
      ) : unavailable ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          {t('catalog.unavailable')}
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <BookOpen className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h2 className="font-semibold">{t('catalog.emptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('catalog.emptyDescription')}</p>
        </div>
      ) : (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('catalog.title')}>
          {courses.map((course) => (
            <article key={course.id} className="flex min-h-60 flex-col rounded-2xl border bg-card p-6 shadow-sm">
              <BookOpen className="mb-8 size-8 text-primary" />
              <h2 className="text-xl font-semibold leading-tight">{course.title}</h2>
              <dl className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Languages className="size-4" />
                  {course.language}
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4" />
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(course.createdAt),
                  )}
                </div>
              </dl>
              <a
                href={`/classroom/${encodeURIComponent(course.classroomId)}`}
                className={cn(buttonVariants(), 'mt-auto w-full')}
              >
                {t('catalog.openClassroom')}
                <ArrowRight className="ms-2 size-4 rtl-flip" />
              </a>
            </article>
          ))}
        </section>
      )}

      {isAdmin && unpublished.length > 0 && (
        <section className="mt-12 border-t pt-10" aria-label={t('catalog.publishReadyTitle')}>
          <h2 className="text-xl font-semibold">{t('catalog.publishReadyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('catalog.publishReadyDescription')}</p>
          {publicationError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {t('catalog.publicationFailed')}
            </p>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unpublished.map((course) => (
              <article key={course.id} className="rounded-2xl border bg-card p-5">
                <h3 className="font-semibold">{course.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{course.language}</p>
                <button
                  type="button"
                  className={cn(buttonVariants({ size: 'sm' }), 'mt-5 w-full')}
                  disabled={publishingCourseId === course.id}
                  onClick={() => void publishCourse(course)}
                >
                  {publishingCourseId === course.id
                    ? t('catalog.publishing')
                    : t('catalog.publish')}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
