'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['pdf', 'pptx', 'docx', 'txt', 'md']);

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
}

interface IngestionEntry {
  id: string;
  name: string;
  status: 'parsing' | 'ready' | 'duplicate' | 'rejected';
  message?: string;
}

export function SourceLibraryPopover({
  orgId,
  clearRequestToken,
  onManifestChange,
  onIngestionBlockChange,
  onError,
  triggerClassName,
  activeTriggerClassName,
}: {
  orgId?: string;
  clearRequestToken: number;
  onManifestChange: (manifestId: string | undefined, selectedCount: number) => void;
  onIngestionBlockChange: (blocked: boolean) => void;
  onError: (error: string | null) => void;
  triggerClassName: string;
  activeTriggerClassName: string;
}) {
  const { t } = useI18n();
  const pdfProviderId = useSettingsStore((state) => state.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((state) => state.pdfProvidersConfig);
  const setPDFProvider = useSettingsStore((state) => state.setPDFProvider);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousClearToken = useRef(clearRequestToken);
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [ingestions, setIngestions] = useState<IngestionEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadLibrary = useCallback(async () => {
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
      if (!libraryResponse.ok) throw new Error(libraryResult.error || t('sources.loadFailed'));
      if (!manifestResponse.ok) throw new Error(manifestResult.error || t('sources.loadFailed'));
      const nextSources = Array.isArray(libraryResult.sources) ? libraryResult.sources : [];
      const nextManifest = manifestResult.manifest ?? null;
      setSources(nextSources);
      setManifest(nextManifest);
      onManifestChange(nextManifest?.id, nextManifest?.sourceIds?.length ?? 0);
      onError(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : t('sources.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [onError, onManifestChange, orgId, t]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const persistSelection = useCallback(
    async (sourceIds: string[], expectedVersion = manifest?.version ?? 0) => {
      if (!orgId) return null;
      setIsSaving(true);
      try {
        const response = await fetch('/api/source-manifests', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId, sourceIds, expectedVersion }),
        });
        const result = await response.json();
        if (!response.ok || !result.manifest) {
          throw new Error(result.error || t('sources.saveFailed'));
        }
        setManifest(result.manifest);
        onManifestChange(result.manifest.id, result.manifest.sourceIds.length);
        onError(null);
        return result.manifest as Manifest;
      } catch (error) {
        onError(error instanceof Error ? error.message : t('sources.saveFailed'));
        await loadLibrary();
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [loadLibrary, manifest?.version, onError, onManifestChange, orgId, t],
  );

  useEffect(() => {
    if (previousClearToken.current === clearRequestToken) return;
    previousClearToken.current = clearRequestToken;
    setIngestions([]);
    void persistSelection([]);
  }, [clearRequestToken, persistSelection]);

  const ingestFiles = async (files: File[]) => {
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
    if (accepted.length === 0) return;
    const nextSourceIds = [
      ...new Set([...(manifest?.sourceIds ?? []), ...accepted.map((source) => source.id)]),
    ];
    const nextManifest = await persistSelection(nextSourceIds);
    if (nextManifest) await loadLibrary();
  };

  const selectedIds = new Set(manifest?.sourceIds ?? []);
  const selectedCount = selectedIds.size;

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
          className={selectedCount > 0 ? activeTriggerClassName : triggerClassName}
          aria-label={t('sources.library')}
        >
          <Paperclip className="size-3.5" />
          {selectedCount > 0 && <span>{selectedCount}</span>}
          {(isLoading || isSaving) && <LoaderCircle className="size-3 animate-spin" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-0">
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

        <div className="max-h-56 overflow-y-auto border-t px-2 py-2">
          {sources.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t('sources.empty')}
            </p>
          ) : (
            sources.map((source) => {
              const selected = selectedIds.has(source.id);
              return (
                <button
                  type="button"
                  key={source.id}
                  disabled={isSaving}
                  className={cn(
                    'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted',
                    selected && 'bg-violet-50 dark:bg-violet-950/25',
                  )}
                  onClick={() =>
                    void persistSelection(
                      selected
                        ? (manifest?.sourceIds ?? []).filter((id) => id !== source.id)
                        : [...(manifest?.sourceIds ?? []), source.id],
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
        <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
          {t('sources.selectionVersion', { count: selectedCount, version: manifest?.version ?? 0 })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
