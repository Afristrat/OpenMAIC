'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Youtube } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { YoutubeState } from '@/lib/hooks/use-youtube';

const RESULTS = ['connected', 'denied', 'scope', 'nochannel', 'invalid', 'error'] as const;
type ConnectionResult = (typeof RESULTS)[number];

function isConnectionResult(value: string | null): value is ConnectionResult {
  return RESULTS.some((result) => result === value);
}

type Props = {
  state: YoutubeState;
  onDisconnect: () => Promise<boolean>;
};

/** Connexion de la chaîne YouTube de la personne ; affiche le résultat du retour de Google. */
export function YoutubeConnectionCard({ state, onDisconnect }: Props): React.ReactElement {
  const { t } = useI18n();
  // Le retour de Google dépose son résultat dans l'adresse (`?youtube=connected`).
  const param = useSearchParams().get('youtube');
  const result = isConnectionResult(param) ? param : null;

  return (
    <section
      aria-labelledby="youtube-card-title"
      className="mb-8 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex flex-wrap items-center gap-4">
        <Youtube className="size-6 shrink-0 text-red-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2
            id="youtube-card-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('youtube.title')}
          </h2>
          {state.failed ? (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">{t('youtube.loadError')}</p>
          ) : !state.configured && !state.loading ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('youtube.notConfigured')}
            </p>
          ) : state.channel ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {t('youtube.connectedAs', { channel: state.channel.title })}
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('youtube.connectLead')}
            </p>
          )}
        </div>
        {state.channel ? (
          <button
            type="button"
            onClick={() => void onDisconnect()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {t('youtube.disconnect')}
          </button>
        ) : (
          state.configured && (
            // Navigation complète : la route redirige vers l'écran de consentement de Google.
            <form method="get" action="/api/youtube/connect">
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                {t('youtube.connect')}
              </button>
            </form>
          )
        )}
      </div>
      {result && (
        <p
          role="status"
          className={
            result === 'connected'
              ? 'mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-300'
              : 'mt-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300'
          }
        >
          {result === 'connected' ? (
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="size-4 shrink-0" aria-hidden />
          )}
          {t(`youtube.result.${result}`)}
        </p>
      )}
    </section>
  );
}
