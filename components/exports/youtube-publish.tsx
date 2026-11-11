'use client';

import { useState } from 'react';
import { ExternalLink, Youtube } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { YoutubeUpload } from '@/lib/hooks/use-youtube';
import { YoutubePublishDialog } from '@/components/exports/youtube-publish-dialog';

type Props = {
  exportJobId: string;
  /** `video` : le cours entier ; `mp4` : un chapitre à choisir parmi `chapterCount`. */
  format: 'video' | 'mp4';
  chapterCount: number;
  uploads: YoutubeUpload[];
  /** Sans chaîne connectée, rien ne se publie : seul l'historique des envois reste visible. */
  channelConnected: boolean;
  onPublished: () => Promise<void>;
};

/** Bouton de publication (modal) et suivi des envois d'UN export vidéo. */
export function YoutubePublish({
  exportJobId,
  format,
  chapterCount,
  uploads,
  channelConnected,
  onPublished,
}: Props): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full">
      {channelConnected && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Youtube className="size-4 text-red-600" aria-hidden />
          {t('youtube.publish')}
        </button>
      )}
      {channelConnected && (
        <YoutubePublishDialog
          open={open}
          onOpenChange={setOpen}
          exportJobId={exportJobId}
          format={format}
          chapterCount={chapterCount}
          onPublished={onPublished}
        />
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
