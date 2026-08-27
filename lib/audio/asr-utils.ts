const AUDIO_FILE_EXTENSIONS = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'oga',
  'ogg',
  'wav',
  'webm',
]);

const AUDIO_MEDIA_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
]);

const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export function normalizeASRLanguage(language?: string | null): string {
  const value = language?.trim();
  if (!value || value.toLowerCase() === 'auto') return 'auto';

  const baseLanguage = /^([a-z]{2,3})(?:[-_]|$)/i.exec(value)?.[1];
  return baseLanguage?.toLowerCase() ?? value;
}

export function resolveASRLanguageSelection(
  currentLanguage: string,
  supportedLanguages: readonly string[],
): string {
  if (supportedLanguages.includes(currentLanguage)) return currentLanguage;

  const normalizedCurrent = normalizeASRLanguage(currentLanguage);
  const equivalent = supportedLanguages.find(
    (candidate) => normalizeASRLanguage(candidate) === normalizedCurrent,
  );
  return equivalent ?? supportedLanguages[0] ?? 'auto';
}

export function selectASRRecordingMimeType(
  isTypeSupported?: (mimeType: string) => boolean,
): string | undefined {
  if (!isTypeSupported) return undefined;
  return RECORDING_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType));
}

export function getASRAudioFileName(blob: Blob): string {
  const mediaType = blob.type.toLowerCase().split(';', 1)[0];
  const extensionByType: Record<string, string> = {
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-wav': 'wav',
  };
  return `recording.${extensionByType[mediaType] ?? 'webm'}`;
}

export function isSupportedASRAudioUpload(file: File): boolean {
  const mediaType = file.type.toLowerCase().split(';', 1)[0];
  if (AUDIO_MEDIA_TYPES.has(mediaType)) return true;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return (!mediaType || mediaType === 'application/octet-stream') &&
    !!extension &&
    AUDIO_FILE_EXTENSIONS.has(extension);
}
