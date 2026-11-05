'use client';

import { useState } from 'react';
import { ExternalLink, Youtube } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { YoutubeUpload } from '@/lib/hooks/use-youtube';

const FIELD =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100';

type Props = {
  exportJobId: string;
  courseName: string | null;
  /** `video` : le cours entier ; `mp4` : un chapitre à choisir parmi `chapterCount`. */
  format: 'video' | 'mp4';
  chapterCount: number;
  uploads: YoutubeUpload[];
  /** Sans chaîne connectée, rien ne se publie : seul l'historique des envois reste visible. */
  channelConnected: boolean;
  onPublished: () => Promise<void>;
};

/** Bouton, formulaire de publication et suivi des envois d'UN export vidéo. */
export function YoutubePublish({
  exportJobId,
  courseName,
  format,
  chapterCount,
  uploads,
  channelConnected,
  onPublished,
}: Props): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [title, setTitle] = useState(courseName ?? '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const chapterTitle = (index: number): string =>
    `${courseName ?? ''} · ${t('youtube.chapterOption', { number: index + 1 })}`.trim();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('/api/youtube/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportJobId,
          ...(format === 'mp4' ? { chapterIndex: chapter } : {}),
          title,
          description,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setOpen(false);
      await onPublished();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const inputId = `youtube-${exportJobId}`;
  return (
    <div className="w-full">
      {!open && channelConnected && (
        <button
          type="button"
          onClick={() => {
            setTitle(format === 'mp4' ? chapterTitle(chapter) : (courseName ?? ''));
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Youtube className="size-4 text-red-600" aria-hidden />
          {t('youtube.publish')}
        </button>
      )}

      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-2 space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
        >
          {format === 'mp4' && (
            <div>
              <label
                htmlFor={`${inputId}-chapter`}
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                {t('youtube.formChapter')}
              </label>
              <select
                id={`${inputId}-chapter`}
                value={chapter}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setChapter(next);
                  setTitle(chapterTitle(next));
                }}
                className={FIELD}
              >
                {Array.from({ length: chapterCount }, (_, index) => (
                  <option key={index} value={index}>
                    {t('youtube.chapterOption', { number: index + 1 })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              htmlFor={`${inputId}-title`}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {t('youtube.formTitle')}
            </label>
            <input
              id={`${inputId}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              required
              className={FIELD}
            />
          </div>
          <div>
            <label
              htmlFor={`${inputId}-description`}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {t('youtube.formDescription')}
            </label>
            <textarea
              id={`${inputId}-description`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={5000}
              rows={3}
              className={FIELD}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('youtube.unlistedNote')}</p>
          {failed && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {t('youtube.publishError')}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
            >
              {t('youtube.submit')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {t('youtube.cancel')}
            </button>
          </div>
        </form>
      )}

      {uploads.length > 0 && (
        <ul className="mt-2 space-y-2">
          {uploads.map((upload) => (
            <li
              key={upload.id}
              className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-950 dark:text-gray-200"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{upload.title}</span>
                <span className="text-xs font-bold">{t(`youtube.status.${upload.status}`)}</span>
                {upload.status === 'done' && upload.videoId && (
                  <a
                    href={`https://youtu.be/${encodeURIComponent(upload.videoId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-purple-700 hover:underline dark:text-purple-300"
                  >
                    {t('youtube.view')}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
              {upload.status === 'done' && upload.appliedPrivacy === 'private' && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  {t('youtube.privacyLocked')}
                </p>
              )}
              {upload.status === 'error' && (
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                  {t(
                    upload.error === 'RECONNECT_REQUIRED' || upload.error === 'QUOTA_EXCEEDED'
                      ? `youtube.error.${upload.error}`
                      : 'youtube.error.UPLOAD_FAILED',
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
