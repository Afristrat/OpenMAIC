'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Video, X } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useVideoCapsule } from '@/lib/video/use-video-capsule';

interface VideoCapsuleModalProps {
  readonly stageId: string;
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly onClose: () => void;
}

const DEFAULT_DURATION_S = 60;

/**
 * Formulaire + suivi de génération d'une capsule vidéo Hyperframes pour une
 * scène. `audience`/`tone`/`objective` sont des enums côté Mishkāt dont les
 * valeurs closes ne sont pas publiées (cf. lib/video/hyperframes-types.ts) —
 * laissés en saisie libre plutôt que devinés.
 */
export function VideoCapsuleModal({
  stageId,
  sceneId,
  sceneTitle,
  onClose,
}: VideoCapsuleModalProps) {
  const { t } = useI18n();
  const { status, variants, error, generate } = useVideoCapsule();
  const [audience, setAudience] = useState('learners');
  const [tone, setTone] = useState('engaging');
  const [objective, setObjective] = useState('inform');
  const [durationS, setDurationS] = useState(DEFAULT_DURATION_S);

  const isBusy = status === 'queued' || status === 'generating' || status === 'rendering';
  const isDone = status === 'done';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 p-5 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Video className="w-4 h-4 text-purple-500" />
            {t('videoCapsule.title')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate">{sceneTitle}</p>

        {status === 'idle' || status === 'error' ? (
          <div className="space-y-2.5">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('videoCapsule.audience')}
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('videoCapsule.tone')}
              <input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('videoCapsule.objective')}
              <input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('videoCapsule.duration')}
              <input
                type="number"
                min={10}
                max={180}
                value={durationS}
                onChange={(e) => setDurationS(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm"
              />
            </label>
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </p>
            )}
            <button
              onClick={() =>
                generate({ stageId, sceneId, audience, tone, objective, durationS })
              }
              disabled={!audience || !tone || !objective}
              className="mt-1 w-full rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 transition-colors"
            >
              {t('videoCapsule.generate')}
            </button>
          </div>
        ) : isBusy ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
            <span>{t(`videoCapsule.status.${status}`)}</span>
          </div>
        ) : isDone ? (
          <div className="space-y-3">
            {variants.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('videoCapsule.noVariants')}
              </p>
            )}
            {variants.map((v) => (
              <div key={`${v.lang}-${v.format}`} className="space-y-1">
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {v.lang} · {v.format}
                </p>
                {/* Sous-titres déjà brûlés dans le mp4 côté Mishkāt (sound.captions_burned) */}
                <video src={v.url} controls className="w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
