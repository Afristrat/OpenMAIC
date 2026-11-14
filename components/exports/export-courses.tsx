'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { YoutubePublish } from '@/components/exports/youtube-publish';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { useYoutube } from '@/lib/hooks/use-youtube';

interface Course {
  id: string;
  name: string | null;
  createdAt: string;
  video?: {
    id: string;
    status: 'queued' | 'generating' | 'done' | 'error';
    format: 'video' | 'mp4';
    scene_count: number;
  };
}

export function ExportCourses({
  youtube,
  onExportStarted,
}: {
  youtube: ReturnType<typeof useYoutube>;
  onExportStarted: () => void;
}) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/export-jobs/formations?page=${page}`, {
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error('Unable to load courses');
        const result: { courses: Course[]; hasMore: boolean } = await response.json();
        setCourses(result.courses);
        setHasMore(result.hasMore);
        setLoadFailed(false);
      } catch {
        if (!signal?.aborted) setLoadFailed(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const poll = window.setInterval(() => void load(controller.signal), 5000);
    return () => {
      window.clearInterval(poll);
      controller.abort();
    };
  }, [load]);

  async function startVideo(stageId: string) {
    setStarting(stageId);
    setError('');
    try {
      const response = await fetch('/api/export-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, format: 'video' }),
      });
      const result: { id?: string; error?: string } = await response.json();
      if (!response.ok || !result.id) {
        setError(result.error || t('export.exportFailed'));
        return;
      }
      await load();
      onExportStarted();
    } catch {
      setError(t('export.exportFailed'));
    } finally {
      setStarting(null);
    }
  }

  function navigate(nextPage: number) {
    setLoading(true);
    setPage(nextPage);
  }

  return (
    <section className="mb-8" aria-labelledby="export-courses-title">
      <h2 id="export-courses-title" className="mb-4 text-lg font-semibold">
        {t('exports.courses')}
      </h2>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {loadFailed && <p role="alert">{t('exports.loadError')}</p>}
      {loading ? (
        <p role="status">{t('exports.loadingCourses')}</p>
      ) : (
        <>
          {!loadFailed && courses.length === 0 && <p>{t('exports.noCourses')}</p>}
          <ul className="divide-y rounded-xl border bg-card px-4">
            {courses.map((course) => {
              const video = course.video;
              return (
                <li
                  key={course.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <a
                      className="break-words font-medium underline-offset-4 hover:underline"
                      href={`/classroom/${encodeURIComponent(course.id)}`}
                    >
                      {course.name || t('exports.untitled')}
                    </a>
                    <p className="text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(course.createdAt))}
                      {' · '}
                      {video ? t(`exports.status.${video.status}`) : t('exports.noVideo')}
                    </p>
                  </div>
                  {video?.status === 'done' ? (
                    <YoutubePublish
                      exportJobId={video.id}
                      format={video.format}
                      chapterCount={video.scene_count}
                      uploads={youtube.state.uploads.filter(
                        (upload) => upload.exportJobId === video.id,
                      )}
                      channelConnected={youtube.state.channel !== null}
                      onPublished={youtube.refresh}
                    />
                  ) : (
                    (!video || video.status === 'error') && (
                      <Button
                        variant="outline"
                        disabled={starting !== null}
                        onClick={() => void startVideo(course.id)}
                      >
                        {t(
                          starting === course.id ? 'exports.startingVideo' : 'exports.prepareVideo',
                        )}
                      </Button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
          {(page > 0 || hasMore) && (
            <div className="mt-3 flex gap-2">
              {page > 0 && (
                <Button variant="outline" onClick={() => navigate(page - 1)}>
                  {t('syllabi.previous')}
                </Button>
              )}
              {hasMore && (
                <Button variant="outline" onClick={() => navigate(page + 1)}>
                  {t('syllabi.next')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
