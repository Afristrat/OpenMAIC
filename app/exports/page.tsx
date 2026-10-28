'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Calendar, Download, FileVideo } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { cn } from '@/lib/utils';

type ExportStatus = 'queued' | 'generating' | 'done' | 'error';

interface ExportItem {
  id: string;
  courseName: string | null;
  format: string;
  status: ExportStatus;
  createdAt: string;
}

const STATUS_STYLES: Record<ExportStatus, string> = {
  queued: 'text-gray-600 bg-gray-100 dark:text-gray-300 dark:bg-gray-800',
  generating: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30',
  done: 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950/30',
  error: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/30',
};

function isExportStatus(value: string): value is ExportStatus {
  return value === 'queued' || value === 'generating' || value === 'done' || value === 'error';
}

export default function ExportsPage(): React.ReactElement {
  const { t, locale } = useI18n();
  const { isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/export-jobs', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Export list request failed: ${response.status}`);
      const body = (await response.json()) as {
        success?: boolean;
        exports?: Array<Omit<ExportItem, 'status'> & { status: string }>;
      };
      if (!body.success || !Array.isArray(body.exports)) throw new Error('Invalid export list');
      setItems(
        body.exports.flatMap((item) =>
          isExportStatus(item.status) ? [{ ...item, status: item.status }] : [],
        ),
      );
    } catch {
      setItems([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const formatDate = (value: string): string =>
    new Date(value).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="flex-1 px-6 py-8 lg:px-12">
        <h1 className="mb-8 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('exports.title')}
        </h1>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="mb-4 size-10 text-red-500" />
            <p className="mb-5 text-base text-gray-600 dark:text-gray-300">
              {t('exports.loadError')}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              {t('exports.retry')}
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-20 text-center text-base text-gray-500 dark:text-gray-400">
            {t('exports.empty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <FileVideo className="size-6 shrink-0 text-purple-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                    {item.courseName ?? t('exports.untitled')}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span>{t(`export.${item.format}`)}</span>
                    <Calendar className="size-3.5 shrink-0" aria-hidden />
                    <span>{formatDate(item.createdAt)}</span>
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-xs font-bold',
                    STATUS_STYLES[item.status],
                  )}
                >
                  {t(`exports.status.${item.status}`)}
                </span>
                {item.status === 'done' && (
                  <a
                    href={`/api/export-jobs/${encodeURIComponent(item.id)}?download=1`}
                    className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                  >
                    <Download className="size-4" aria-hidden />
                    {t('exports.download')}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
