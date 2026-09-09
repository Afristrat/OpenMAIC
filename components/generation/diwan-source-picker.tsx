'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { DiwanReference } from '@/lib/diwan/references';

const sourceSchema = z.object({
  sourceId: z.string(),
  corpusId: z.string(),
  title: z.string().nullable(),
  originalName: z.string().nullable(),
  status: z.string(),
});
const librarySchema = z.object({
  items: z.array(sourceSchema),
  pagination: z.object({ total: z.number().nonnegative() }),
});
const jobSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum([
    'queued',
    'extracting',
    'chunking',
    'embedding',
    'ready',
    'partially_failed',
    'failed',
  ]),
  progress: z.number().min(0).max(100).optional(),
});
type Selection = Pick<DiwanReference, 'corpusId' | 'sourceId'>;

export function DiwanSourcePicker({
  orgId,
  selected,
  disabled,
  remaining,
  onSelectionChange,
}: {
  orgId: string;
  selected: DiwanReference[];
  disabled: boolean;
  remaining: number;
  onSelectionChange: (selection: Selection[]) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<z.infer<typeof sourceSchema>[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<z.infer<typeof jobSchema> | null>(null);
  const [resumeId, setResumeId] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const lock = useRef(false);
  const storageKey = `qalem-diwan-job:${orgId}`;
  const endpoint = `/api/documents/diwan/${encodeURIComponent(orgId)}`;
  useEffect(() => {
    active.current = true;
    try {
      const id = sessionStorage.getItem(storageKey);
      // Only the opaque job ID is kept in this tab; authorization is always server-side.
      if (id && id.length <= 512) setResumeId(id);
    } catch {
      /* Browser storage may be unavailable; the manual job field still works. */
    }
    return () => {
      active.current = false;
    };
  }, [storageKey]);

  async function read(response: Response): Promise<unknown> {
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        body.errorCode === 'DIWAN_TENANT_NOT_CONFIGURED'
          ? t('sources.diwanNotConfigured')
          : t('sources.diwanFailed'),
      );
    return body;
  }
  async function run(work: () => Promise<void>) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error && !(reason instanceof z.ZodError)
            ? reason.message
            : t('sources.diwanFailed'),
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function load(nextPage = page) {
    await run(async () => {
      const result = librarySchema.parse(
        await read(
          await fetch(`${endpoint}?page=${nextPage}&pageSize=20`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(45000),
          }),
        ),
      );
      if (!active.current) return;
      setItems(result.items);
      setPage(nextPage);
      setTotal(result.pagination.total);
      setLoaded(true);
    });
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    if (
      files.length > 20 ||
      files.some((file) => file.size === 0) ||
      files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024
    ) {
      setError(t('sources.diwanUploadLimit'));
      return;
    }
    await run(async () => {
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      form.set('idempotencyKey', crypto.randomUUID());
      const result = jobSchema.parse(
        await read(
          await fetch(endpoint, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(45000),
          }),
        ),
      );
      try {
        sessionStorage.setItem(storageKey, result.jobId);
      } catch {
        if (active.current) setError(t('sources.diwanSaveJob'));
      }
      if (!active.current) return;
      setJob(result);
      setResumeId(result.jobId);
    });
  }
  async function refreshJob() {
    await run(async () => {
      const result = jobSchema.parse(
        await read(
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'status', jobId: resumeId.trim() }),
            signal: AbortSignal.timeout(45000),
          }),
        ),
      );
      if (active.current) setJob(result);
    });
  }
  const chosen = new Set(selected.map((source) => source.sourceId));
  const locked = disabled || busy;
  return (
    <section
      aria-label={t('sources.diwanTitle')}
      aria-busy={locked}
      className="space-y-2 border-t px-3 py-3 text-start text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t('sources.diwanTitle')}</h3>
        <button
          type="button"
          disabled={locked}
          onClick={() => void load(1)}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          {busy ? t('common.loading') : t('sources.refresh')}
        </button>
      </div>
      <p className="text-muted-foreground">{t('sources.diwanDescription')}</p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        data-testid="diwan-file-input"
        onChange={(event) => {
          void upload(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={locked}
        onClick={() => fileInput.current?.click()}
        className="rounded border px-2 py-1 disabled:opacity-50"
      >
        {t('sources.diwanUpload')}
      </button>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          {t('sources.diwanJob')}
          <input
            value={resumeId}
            maxLength={512}
            onChange={(event) => {
              setResumeId(event.target.value);
              setJob(null);
            }}
            className="mt-1 w-full rounded border bg-background p-1"
            dir="ltr"
          />
        </label>
        <button
          type="button"
          disabled={locked || !resumeId.trim()}
          onClick={() => void refreshJob()}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          {t('sources.diwanTrack')}
        </button>
      </div>
      {job && (
        <p role="status">
          {t(`sources.diwanStatus.${job.status}`)}
          {job.progress === undefined ? '' : ` · ${job.progress}%`}
        </p>
      )}
      {selected.length > 0 && (
        <ul aria-label={t('sources.diwanSelected')} className="space-y-1">
          {selected.map((source) => (
            <li key={source.sourceId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{source.title}</span>
              <button
                type="button"
                disabled={locked}
                aria-label={t('sources.diwanRemove', { title: source.title })}
                onClick={() =>
                  void onSelectionChange(
                    selected
                      .filter((item) => item.sourceId !== source.sourceId)
                      .map(({ corpusId, sourceId }) => ({ corpusId, sourceId })),
                  )
                }
                className="rounded border px-2 py-1"
              >
                {t('sources.diwanUnselect')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loaded && !error && items.length === 0 && <p>{t('sources.empty')}</p>}
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {items.map((source) => (
          <label
            key={`${source.corpusId}:${source.sourceId}`}
            className="flex items-center gap-2 rounded p-1 hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={chosen.has(source.sourceId)}
              disabled={
                locked ||
                source.status !== 'ready' ||
                (!chosen.has(source.sourceId) && remaining <= 0)
              }
              onChange={() =>
                void onSelectionChange(
                  chosen.has(source.sourceId)
                    ? selected
                        .filter((item) => item.sourceId !== source.sourceId)
                        .map(({ corpusId, sourceId }) => ({ corpusId, sourceId }))
                    : [
                        ...selected.map(({ corpusId, sourceId }) => ({ corpusId, sourceId })),
                        { corpusId: source.corpusId, sourceId: source.sourceId },
                      ],
                )
              }
            />
            <span className="min-w-0 flex-1 truncate">
              {source.title || source.originalName || source.sourceId}
            </span>
            {source.status !== 'ready' && <span>{t('sources.diwanNotReady')}</span>}
          </label>
        ))}
      </div>
      {loaded && (
        <div className="flex justify-between gap-2">
          <button type="button" disabled={locked || page <= 1} onClick={() => void load(page - 1)}>
            {t('marketplace.previousPage')}
          </button>
          <span>{page}</span>
          <button
            type="button"
            disabled={locked || page * 20 >= total}
            onClick={() => void load(page + 1)}
          >
            {t('marketplace.nextPage')}
          </button>
        </div>
      )}
    </section>
  );
}
