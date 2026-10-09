'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertCircle, Check, FileText, LoaderCircle, Paperclip, RefreshCw, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildDocumentParseFormData } from '@/lib/document/upload-request';
import { useI18n } from '@/lib/hooks/use-i18n';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import { useSettingsStore } from '@/lib/store/settings';
import type { PdfImage } from '@/lib/types/generation';
import { cn } from '@/lib/utils';
import { DiwanSourcePicker } from './diwan-source-picker';
import { diwanReferences, type DiwanReference } from '@/lib/diwan/references';

const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['pdf', 'pptx', 'docx', 'txt', 'md']);
const subscribeToHydration = () => () => undefined;

interface LibrarySource {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: 'ready' | 'rejected';
}

interface Manifest {
  id: string;
  version: number;
  sourceIds: string[];
  diwanReferences?: DiwanReference[];
}

interface IngestionEntry {
  id: string;
  name: string;
  status: 'parsing' | 'ready' | 'duplicate' | 'rejected';
  message?: string;
}

interface DraftSelection {
  manifestId: string;
  version: number;
  sourceIds: string[];
  diwanReferences: DiwanReference[];
}

function draftSelectionStorageKey(orgId: string, ownerId: string): string {
  return `qalem:source-selection:${orgId}:${ownerId}`;
}

export function clearPersistedSourceSelection(orgId?: string, ownerId?: string): void {
  if (!orgId || !ownerId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(draftSelectionStorageKey(orgId, ownerId));
  } catch {
    // Storage can be unavailable in hardened browsing contexts.
  }
}

function readDraftSelection(orgId?: string, ownerId?: string): DraftSelection | null {
  if (!orgId || !ownerId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(draftSelectionStorageKey(orgId, ownerId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<DraftSelection>;
    if (
      typeof candidate.manifestId !== 'string' ||
      typeof candidate.version !== 'number' ||
      !Number.isSafeInteger(candidate.version) ||
      candidate.version < 1 ||
      !Array.isArray(candidate.sourceIds) ||
      !candidate.sourceIds.every((id) => typeof id === 'string') ||
      !Array.isArray(candidate.diwanReferences)
    ) {
      return null;
    }
    const parsedDiwanReferences = diwanReferences.safeParse(candidate.diwanReferences);
    if (!parsedDiwanReferences.success) return null;
    return { ...candidate, diwanReferences: parsedDiwanReferences.data } as DraftSelection;
  } catch {
    return null;
  }
}

export function SourceLibraryPopover({
  orgId,
  ownerId,
  onManifestChange,
  onIngestionBlockChange,
  onError,
  triggerClassName,
  activeTriggerClassName,
}: {
  orgId?: string;
  ownerId?: string;
  onManifestChange: (
    manifestId: string | undefined,
    selectedCount: number,
    manifestVersion?: number,
  ) => void;
  onIngestionBlockChange: (blocked: boolean) => void;
  onError: (error: string | null) => void;
  triggerClassName: string;
  activeTriggerClassName: string;
}) {
  const { t } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const setPDFProvider = useSettingsStore((state) => state.setPDFProvider);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionInitialized = useRef(false);
  const lifecycle = useRef(0);
  const saving = useRef(false);
  useEffect(
    () => () => {
      lifecycle.current += 1;
    },
    [],
  );
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectedDiwanSources, setSelectedDiwanSources] = useState<DiwanReference[]>([]);
  const [search, setSearch] = useState('');
  const [ingestions, setIngestions] = useState<IngestionEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadLibrary = useCallback(async () => {
    const ticket = lifecycle.current;
    if (!orgId) {
      setSources([]);
      setManifest(null);
      setIngestions([]);
      onManifestChange(undefined, 0);
      return;
    }
    setIsLoading(true);
    try {
      const [libraryResponse, manifestResponse] = await Promise.all([
        fetch(`/api/source-library?orgId=${encodeURIComponent(orgId)}`),
        fetch(`/api/source-manifests?orgId=${encodeURIComponent(orgId)}`),
      ]);
      const [libraryResult, manifestResult] = await Promise.all([
        libraryResponse.json(),
        manifestResponse.json(),
      ]);
      if (ticket !== lifecycle.current) return;
      if (!libraryResponse.ok) throw new Error(libraryResult.error || t('sources.loadFailed'));
      if (!manifestResponse.ok) throw new Error(manifestResult.error || t('sources.loadFailed'));
      const nextSources = Array.isArray(libraryResult.sources) ? libraryResult.sources : [];
      const nextManifest = manifestResult.manifest ?? null;
      setSources(nextSources);
      setManifest(nextManifest);
      if (!selectionInitialized.current) {
        // A library manifest is the last immutable selection, not a default for
        // every new course. Restore only the current tab's in-progress draft.
        const draft = readDraftSelection(orgId, ownerId);
        const availableIds = new Set(nextSources.map((source: LibrarySource) => source.id));
        const canRestoreDraft = (draft?.sourceIds ?? []).every((id) => availableIds.has(id));
        const restoredSourceIds = canRestoreDraft ? (draft?.sourceIds ?? []) : [];
        const restoredDiwanReferences = canRestoreDraft ? (draft?.diwanReferences ?? []) : [];
        if (!canRestoreDraft) clearPersistedSourceSelection(orgId, ownerId);
        setSelectedSourceIds(restoredSourceIds);
        setSelectedDiwanSources(restoredDiwanReferences);
        const restoredCount = restoredSourceIds.length + restoredDiwanReferences.length;
        onManifestChange(
          restoredCount > 0 ? draft?.manifestId : undefined,
          restoredCount,
          restoredCount > 0 ? draft?.version : nextManifest?.version,
        );
        selectionInitialized.current = true;
      }
      onError(null);
    } catch (error) {
      if (ticket !== lifecycle.current) return;
      onError(error instanceof Error ? error.message : t('sources.loadFailed'));
    } finally {
      if (ticket === lifecycle.current) setIsLoading(false);
    }
  }, [onError, onManifestChange, orgId, ownerId, t]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const persistSelection = useCallback(
    async (
      sourceIds: string[],
      expectedVersion = manifest?.version ?? 0,
      diwanSources: Array<Pick<DiwanReference, 'corpusId' | 'sourceId'>> = selectedDiwanSources,
    ) => {
      if (!orgId || saving.current) return null;
      const ticket = lifecycle.current;
      saving.current = true;
      setIsSaving(true);
      try {
        const response = await fetch('/api/source-manifests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, sourceIds, expectedVersion, diwanSources }),
        });
        const result = await response.json();
        if (ticket !== lifecycle.current) return null;
        if (!response.ok || !result.manifest) {
          throw new Error(result.error || t('sources.saveFailed'));
        }
        setManifest(result.manifest);
        setSelectedSourceIds(sourceIds);
        setSelectedDiwanSources(result.manifest.diwanReferences ?? []);
        const count =
          result.manifest.sourceIds.length + (result.manifest.diwanReferences?.length ?? 0);
        if (count > 0 && orgId && ownerId && typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(
              draftSelectionStorageKey(orgId, ownerId),
              JSON.stringify({
                manifestId: result.manifest.id,
                version: result.manifest.version,
                sourceIds: result.manifest.sourceIds,
                diwanReferences: result.manifest.diwanReferences ?? [],
              } satisfies DraftSelection),
            );
          } catch {
            // The server manifest remains usable for this page if storage is blocked.
          }
        } else {
          clearPersistedSourceSelection(orgId, ownerId);
        }
        onManifestChange(
          count > 0 ? result.manifest.id : undefined,
          count,
          result.manifest.version,
        );
        onError(null);
        return result.manifest as Manifest;
      } catch (error) {
        if (ticket !== lifecycle.current) return null;
        await loadLibrary();
        onError(error instanceof Error ? error.message : t('sources.saveFailed'));
        return null;
      } finally {
        saving.current = false;
        if (ticket === lifecycle.current) setIsSaving(false);
      }
    },
    [
      loadLibrary,
      manifest?.version,
      onError,
      onManifestChange,
      orgId,
      ownerId,
      selectedDiwanSources,
      t,
    ],
  );

  const ingestFiles = async (files: File[]) => {
    const ticket = lifecycle.current;
    if (!orgId || files.length === 0) return;
    const validFiles: File[] = [];
    const initialEntries = files.map((file, index): IngestionEntry => {
      const id = `${Date.now()}-${index}-${file.name}`;
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
        return { id, name: file.name, status: 'rejected', message: t('sources.unsupported') };
      }
      if (file.size === 0 || file.size > MAX_DOCUMENT_SIZE_BYTES) {
        return { id, name: file.name, status: 'rejected', message: t('sources.invalidSize') };
      }
      validFiles.push(file);
      return { id, name: file.name, status: 'parsing' };
    });
    setIngestions((current) => [...initialEntries, ...current].slice(0, 20));
    if (validFiles.length === 0) return;

    const providerConfig = pdfProvidersConfig[pdfProviderId];
    const persisted = await Promise.all(
      validFiles.map(async (file) => {
        const entry = initialEntries.find(
          (candidate) => candidate.name === file.name && candidate.status === 'parsing',
        )!;
        try {
          const isPdf = file.name.toLowerCase().endsWith('.pdf');
          const parseResponse = await fetch(isPdf ? '/api/parse-pdf' : '/api/parse-document', {
            method: 'POST',
            body: buildDocumentParseFormData(file, {
              providerId: pdfProviderId,
              apiKey: providerConfig?.apiKey,
              baseUrl: providerConfig?.baseUrl,
            }),
          });
          const parsed = await parseResponse.json();
          const text = typeof parsed.data?.text === 'string' ? parsed.data.text.trim() : '';
          if (!parseResponse.ok || !parsed.success || !text) {
            const noReadablePdfText =
              isPdf &&
              (parsed.errorCode === 'NO_READABLE_PDF_TEXT' ||
                (parseResponse.ok && parsed.success && !text));
            throw new Error(
              noReadablePdfText
                ? t('generation.pdfNoTextExtracted')
                : parsed.details || parsed.error || t('sources.rejected'),
            );
          }
          const images = Array.isArray(parsed.data?.metadata?.pdfImages)
            ? (parsed.data.metadata.pdfImages as PdfImage[])
            : Array.isArray(parsed.data?.images)
              ? (parsed.data.images as string[])
              : [];
          const sourceResponse = await fetch('/api/source-library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orgId,
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              parserId: pdfProviderId,
              content: { text, images },
            }),
          });
          const result = await sourceResponse.json();
          if (!sourceResponse.ok || !result.source) {
            throw new Error(result.error || t('sources.rejected'));
          }
          setIngestions((current) =>
            current.map((candidate) =>
              candidate.id === entry.id
                ? {
                    ...candidate,
                    status: result.duplicate ? 'duplicate' : 'ready',
                    message: result.duplicate ? t('sources.duplicate') : undefined,
                  }
                : candidate,
            ),
          );
          return result.source as LibrarySource;
        } catch (error) {
          setIngestions((current) =>
            current.map((candidate) =>
              candidate.id === entry.id
                ? {
                    ...candidate,
                    status: 'rejected',
                    message: error instanceof Error ? error.message : t('sources.rejected'),
                  }
                : candidate,
            ),
          );
          return null;
        }
      }),
    );

    const accepted = persisted.filter((source): source is LibrarySource => source !== null);
    if (ticket !== lifecycle.current) return;
    if (accepted.length === 0) return;
    const nextSourceIds = [
      ...new Set([...selectedSourceIds, ...accepted.map((source) => source.id)]),
    ];
    const nextManifest = await persistSelection(nextSourceIds);
    if (nextManifest) await loadLibrary();
  };

  const selectedIds = new Set(selectedSourceIds);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleSources = normalizedSearch
    ? sources.filter((source) => source.name.toLocaleLowerCase().includes(normalizedSearch))
    : sources;
  const selectedCount = selectedIds.size + selectedDiwanSources.length;

  useEffect(() => {
    onIngestionBlockChange(
      selectedCount === 0 &&
        ingestions.some((entry) => entry.status === 'parsing' || entry.status === 'rejected'),
    );
  }, [ingestions, onIngestionBlockChange, selectedCount]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!orgId || !hydrated}
          className={selectedCount > 0 ? activeTriggerClassName : triggerClassName}
          aria-label={t('sources.library')}
        >
          <Paperclip className="size-3.5" />
          {selectedCount > 0 && <span>{selectedCount}</span>}
          {(isLoading || isSaving) && <LoaderCircle className="size-3 animate-spin" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[85dvh] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="min-w-0 flex-1 text-sm font-semibold">{t('sources.library')}</span>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label={t('sources.refresh')}
            onClick={() => void loadLibrary()}
          >
            <RefreshCw className="size-3.5" />
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              disabled={isSaving}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={() => void persistSelection([], undefined, [])}
            >
              {t('sources.clearSelection')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('toolbar.pdfParser')}
          </span>
          <Select
            value={pdfProviderId}
            onValueChange={(value) => setPDFProvider(value as PDFProviderId)}
          >
            <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(PDF_PROVIDERS).map((provider) => {
                const config = pdfProvidersConfig[provider.id];
                const available =
                  !provider.requiresApiKey || !!config?.apiKey || !!config?.isServerConfigured;
                return (
                  <SelectItem key={provider.id} value={provider.id} disabled={!available}>
                    {provider.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="px-3 pb-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            data-testid="local-source-file-input"
            className="hidden"
            accept=".pdf,.pptx,.docx,.txt,.md"
            onChange={(event) => {
              void ingestFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className={cn(
              'flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 transition-colors',
              isDragging
                ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                : 'border-muted-foreground/20 hover:border-violet-300',
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void ingestFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <Paperclip className="mb-1 size-5 text-muted-foreground/60" />
            <span className="text-xs font-medium">{t('sources.addDocuments')}</span>
            <span className="text-[10px] text-muted-foreground">{t('sources.formats')}</span>
          </button>
        </div>

        {ingestions.length > 0 && (
          <div className="max-h-28 space-y-1 overflow-y-auto border-t px-3 py-2">
            {ingestions.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 text-xs">
                {entry.status === 'parsing' ? (
                  <LoaderCircle className="mt-0.5 size-3.5 animate-spin" />
                ) : entry.status === 'rejected' ? (
                  <AlertCircle className="mt-0.5 size-3.5 text-destructive" />
                ) : (
                  <Check className="mt-0.5 size-3.5 text-emerald-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate">{entry.name}</div>
                  {entry.message && (
                    <div className="text-[10px] text-muted-foreground">{entry.message}</div>
                  )}
                </div>
                {entry.status === 'rejected' && (
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    aria-label={t('sources.dismissRejected')}
                    onClick={() =>
                      setIngestions((current) =>
                        current.filter((candidate) => candidate.id !== entry.id),
                      )
                    }
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t px-2 py-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('sources.search')}
            aria-label={t('sources.search')}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          />
          <p className="px-1 text-[10px] text-muted-foreground" role="status">
            {t('sources.showingCount', { count: visibleSources.length, total: sources.length })}
          </p>
          <div className="max-h-[min(45dvh,30rem)] overflow-y-auto">
            {sources.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t('sources.empty')}
              </p>
            ) : visibleSources.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t('sources.noSearchResults')}
              </p>
            ) : (
              visibleSources.map((source) => {
                const selected = selectedIds.has(source.id);
                return (
                  <button
                    type="button"
                    key={source.id}
                    disabled={isSaving || (!selected && selectedCount >= 20)}
                    className={cn(
                      'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-xs hover:bg-muted',
                      selected && 'bg-violet-50 dark:bg-violet-950/25',
                    )}
                    onClick={() =>
                      void persistSelection(
                        selected
                          ? selectedSourceIds.filter((id) => id !== source.id)
                          : [...selectedSourceIds, source.id],
                      )
                    }
                  >
                    <FileText className="size-4 shrink-0 text-violet-500" />
                    <span className="min-w-0 flex-1 truncate">{source.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {(source.sizeBytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <span
                      className={cn(
                        'grid size-4 place-items-center rounded border',
                        selected && 'border-violet-600 bg-violet-600 text-white',
                      )}
                    >
                      {selected && <Check className="size-3" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        {orgId && (
          <DiwanSourcePicker
            key={orgId}
            orgId={orgId}
            selected={selectedDiwanSources}
            disabled={isSaving || isLoading}
            remaining={20 - selectedCount}
            onSelectionChange={async (selection) =>
              !!(await persistSelection(selectedSourceIds, undefined, selection))
            }
          />
        )}
        <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
          {t('sources.selectionVersion', { count: selectedCount, version: manifest?.version ?? 0 })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
