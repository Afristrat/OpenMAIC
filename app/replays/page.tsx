'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { History, Play, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

interface ReplayListItem {
  id: string;
  started_at: string;
  last_position_ms: number;
  courses: { title: string; stage_id: string } | { title: string; stage_id: string }[];
}

export default function ReplaysPage() {
  const { t, locale } = useI18n();
  const [sessions, setSessions] = useState<ReplayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/live-sessions', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { sessions?: ReplayListItem[] };
      setSessions(body.sessions ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const remove = async (id: string) => {
    const response = await fetch(`/api/live-sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.ok) setSessions((current) => current.filter((session) => session.id !== id));
    else setError(true);
  };

  return (
    <div className="min-h-screen bg-background px-6 py-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold">{t('replay.mySessions')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('replay.libraryDescription')}</p>
        {loading ? (
          <div className="mt-16 text-center text-muted-foreground">{t('common.loading')}</div>
        ) : error ? (
          <div role="alert" className="mt-8 rounded-lg border border-destructive/30 p-4">
            {t('replay.loadFailed')}
          </div>
        ) : sessions.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4 text-muted-foreground">
            <History className="size-10" />
            <p>{t('replay.empty')}</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {sessions.map((session) => {
              const course = Array.isArray(session.courses) ? session.courses[0] : session.courses;
              return (
                <li key={session.id} className="rounded-xl border bg-card p-5 shadow-sm">
                  <h2 className="font-semibold">{course?.title ?? t('replay.untitled')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(session.started_at).toLocaleString(locale)}
                  </p>
                  <div className="mt-5 flex items-center gap-3">
                    <Link
                      href={`/replays/${session.id}`}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                    >
                      <Play className="size-4" />
                      {t('replay.resume')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(session.id)}
                      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-destructive"
                      aria-label={t('replay.deletePermanently')}
                    >
                      <Trash2 className="size-4" />
                      {t('replay.delete')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
