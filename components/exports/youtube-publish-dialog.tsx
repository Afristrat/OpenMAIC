'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import { CREDITS_BLOCKED_I18N_KEY } from '@/lib/billing/credit-error-message';
import { INSUFFICIENT_CREDITS_CODE } from '@/lib/billing/insufficient-credits';
import {
  cleanYoutubeTags,
  YOUTUBE_CATEGORIES,
  YOUTUBE_DESCRIPTION_MAX,
  YOUTUBE_IMPROVE_MIN_CHARS,
  YOUTUBE_LANGUAGES,
  YOUTUBE_TAGS_MAX_CHARS,
  YOUTUBE_TITLE_MAX,
  youtubeTagsLength,
  isYoutubeCategory,
  isYoutubeLanguage,
  type YoutubeCategory,
  type YoutubeLanguage,
  type YoutubeMetadata,
} from '@/lib/youtube/metadata';

const FIELD =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100';
const LABEL = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200';
const COUNTER = 'mt-1 text-end text-xs tabular-nums text-gray-500 dark:text-gray-400';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportJobId: string;
  format: 'video' | 'mp4';
  chapterCount: number;
  onPublished: () => Promise<void>;
};

type AiMode = 'generate' | 'improve';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDraft(json: unknown): YoutubeMetadata | null {
  if (!isRecord(json) || !isRecord(json.draft)) return null;
  const draft = json.draft;
  if (typeof draft.title !== 'string' || typeof draft.description !== 'string') return null;
  return {
    title: draft.title,
    description: draft.description,
    tags: Array.isArray(draft.tags) ? cleanYoutubeTags(draft.tags) : [],
    categoryId: isYoutubeCategory(draft.categoryId) ? draft.categoryId : '27',
    defaultLanguage: isYoutubeLanguage(draft.defaultLanguage) ? draft.defaultLanguage : 'fr',
  };
}

function parseTagsField(value: string): string[] {
  return cleanYoutubeTags(value.split(','));
}

/** Modal de publication : métadonnées préremplies, générées ou améliorées par l'IA, puis envoi. */
export function YoutubePublishDialog({
  open,
  onOpenChange,
  exportJobId,
  format,
  chapterCount,
  onPublished,
}: Props): React.ReactElement {
  const { t } = useI18n();
  const [chapter, setChapter] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [categoryId, setCategoryId] = useState<YoutubeCategory>('27');
  const [language, setLanguage] = useState<YoutubeLanguage>('fr');
  const [loading, setLoading] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const chapterIndex = format === 'mp4' ? chapter : null;
  const query = `exportJobId=${encodeURIComponent(exportJobId)}${
    chapterIndex === null ? '' : `&chapterIndex=${chapterIndex}`
  }`;

  const loadDraft = useCallback(async (): Promise<void> => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/youtube/draft?${query}`);
      const draft = readDraft(await response.json().catch(() => null));
      if (!response.ok || !draft) throw new Error(String(response.status));
      setTitle(draft.title);
      setDescription(draft.description);
      setTagsText(draft.tags.join(', '));
      setCategoryId(draft.categoryId);
      setLanguage(draft.defaultLanguage);
    } catch {
      setMessage(t('youtube.dialog.draftError'));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    if (open) void loadDraft();
  }, [open, loadDraft]);

  const tags = parseTagsField(tagsText);
  const tagsLength = youtubeTagsLength(tags);
  const canImprove = description.trim().length >= YOUTUBE_IMPROVE_MIN_CHARS;
  const disabled = loading || busy || aiBusy !== null;

  const runAi = async (mode: AiMode): Promise<void> => {
    setAiBusy(mode);
    setMessage(null);
    try {
      const response = await fetch('/api/youtube/metadata-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportJobId, chapterIndex, mode, title, description, tags }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = isRecord(json) ? json.errorCode : null;
        setMessage(
          code === INSUFFICIENT_CREDITS_CODE || response.status === 402
            ? t(CREDITS_BLOCKED_I18N_KEY)
            : t('youtube.dialog.aiError'),
        );
        return;
      }
      const metadata = isRecord(json) && isRecord(json.metadata) ? json.metadata : null;
      if (!metadata || typeof metadata.title !== 'string') throw new Error('invalid');
      setTitle(metadata.title);
      if (typeof metadata.description === 'string') setDescription(metadata.description);
      if (Array.isArray(metadata.tags)) setTagsText(cleanYoutubeTags(metadata.tags).join(', '));
    } catch {
      setMessage(t('youtube.dialog.aiError'));
    } finally {
      setAiBusy(null);
    }
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/youtube/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportJobId,
          ...(chapterIndex === null ? {} : { chapterIndex }),
          title,
          description,
          tags,
          categoryId,
          defaultLanguage: language,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      onOpenChange(false);
      await onPublished();
    } catch {
      setMessage(t('youtube.publishError'));
    } finally {
      setBusy(false);
    }
  };

  const id = `youtube-${exportJobId}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('youtube.dialog.title')}</DialogTitle>
          <DialogDescription>{t('youtube.unlistedNote')}</DialogDescription>
        </DialogHeader>

        <form
          id={`${id}-form`}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-4"
          aria-busy={loading}
        >
          {format === 'mp4' && (
            <div>
              <label htmlFor={`${id}-chapter`} className={LABEL}>
                {t('youtube.formChapter')}
              </label>
              <select
                id={`${id}-chapter`}
                value={chapter}
                onChange={(event) => setChapter(Number(event.target.value))}
                disabled={disabled}
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAi('generate')}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-lg border border-purple-300 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-60 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950"
            >
              {aiBusy === 'generate' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {t('youtube.dialog.generate')}
            </button>
            {canImprove && (
              <button
                type="button"
                onClick={() => void runAi('improve')}
                disabled={disabled}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-300 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-60 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950"
              >
                {aiBusy === 'improve' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Wand2 className="size-4" aria-hidden />
                )}
                {t('youtube.dialog.improve')}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {canImprove
              ? t('youtube.dialog.aiBilled')
              : t('youtube.dialog.improveHint', { count: YOUTUBE_IMPROVE_MIN_CHARS })}
          </p>

          <div>
            <label htmlFor={`${id}-title`} className={LABEL}>
              {t('youtube.formTitle')}
            </label>
            <input
              id={`${id}-title`}
              dir="auto"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={YOUTUBE_TITLE_MAX}
              required
              disabled={disabled}
              className={FIELD}
            />
            <p className={COUNTER}>
              {title.length}/{YOUTUBE_TITLE_MAX}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-description`} className={LABEL}>
              {t('youtube.formDescription')}
            </label>
            <textarea
              id={`${id}-description`}
              dir="auto"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={YOUTUBE_DESCRIPTION_MAX}
              rows={8}
              disabled={disabled}
              className={FIELD}
            />
            <p className={COUNTER}>
              {description.length}/{YOUTUBE_DESCRIPTION_MAX}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-tags`} className={LABEL}>
              {t('youtube.dialog.tags')}
            </label>
            <input
              id={`${id}-tags`}
              dir="auto"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              disabled={disabled}
              aria-describedby={`${id}-tags-help`}
              aria-invalid={tagsLength > YOUTUBE_TAGS_MAX_CHARS}
              className={FIELD}
            />
            <div className="mt-1 flex justify-between gap-2 text-xs">
              <span id={`${id}-tags-help`} className="text-gray-500 dark:text-gray-400">
                {t('youtube.dialog.tagsHelp')}
              </span>
              <span
                className={
                  tagsLength > YOUTUBE_TAGS_MAX_CHARS
                    ? 'tabular-nums text-red-700 dark:text-red-300'
                    : 'tabular-nums text-gray-500 dark:text-gray-400'
                }
              >
                {tagsLength}/{YOUTUBE_TAGS_MAX_CHARS}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-category`} className={LABEL}>
                {t('youtube.dialog.category')}
              </label>
              <select
                id={`${id}-category`}
                value={categoryId}
                onChange={(event) => {
                  if (isYoutubeCategory(event.target.value)) setCategoryId(event.target.value);
                }}
                disabled={disabled}
                className={FIELD}
              >
                {YOUTUBE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`youtube.category.${category}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-language`} className={LABEL}>
                {t('youtube.dialog.language')}
              </label>
              <select
                id={`${id}-language`}
                value={language}
                onChange={(event) => {
                  if (isYoutubeLanguage(event.target.value)) setLanguage(event.target.value);
                }}
                disabled={disabled}
                className={FIELD}
              >
                {YOUTUBE_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {t(`youtube.language.${code}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <dl className="grid gap-2 rounded-lg bg-gray-50 p-3 text-sm sm:grid-cols-2 dark:bg-gray-900">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">
                {t('youtube.dialog.visibility')}
              </dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {t('youtube.dialog.unlisted')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">
                {t('youtube.dialog.audience')}
              </dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {t('youtube.dialog.notForKids')}
              </dd>
            </div>
          </dl>

          {message && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {message}
            </p>
          )}
        </form>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {t('youtube.cancel')}
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            disabled={disabled || !title.trim() || tagsLength > YOUTUBE_TAGS_MAX_CHARS}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('youtube.submit')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
