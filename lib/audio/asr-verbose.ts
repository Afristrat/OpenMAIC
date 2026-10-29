/**
 * Transcription horodatée (segments et mots) pour l'extension de capture.
 *
 * `transcribeAudio` ne rend que le texte ; la narration de l'extension a besoin des segments et
 * des mots avec leurs instants pour rattacher chaque phrase à l'étape qu'elle décrit. Même mesure
 * du débit que `transcribeAudio` (seconde d'audio), même fournisseur géré par la plateforme.
 */

import { runMeteredTenantUsage } from '@/lib/billing/usage-metering';
import type { ASRModelConfig } from './types';

export type VerboseTranscript = {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    no_speech_prob?: number;
    avg_logprob?: number;
    compression_ratio?: number;
  }>;
  words: Array<{ word: string; start: number; end: number }>;
};

const ERROR_BODY_LIMIT = 200;

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Ne garde que les champs attendus : le corps du fournisseur n'est jamais relayé tel quel. */
export function parseVerboseTranscript(body: unknown): VerboseTranscript {
  const source = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const segments: VerboseTranscript['segments'] = [];
  for (const entry of Array.isArray(source.segments) ? source.segments : []) {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const start = finite(raw.start);
    const end = finite(raw.end);
    if (start === undefined || end === undefined || typeof raw.text !== 'string') continue;
    segments.push({
      start,
      end,
      text: raw.text,
      ...(finite(raw.no_speech_prob) !== undefined
        ? { no_speech_prob: finite(raw.no_speech_prob) }
        : {}),
      ...(finite(raw.avg_logprob) !== undefined ? { avg_logprob: finite(raw.avg_logprob) } : {}),
      ...(finite(raw.compression_ratio) !== undefined
        ? { compression_ratio: finite(raw.compression_ratio) }
        : {}),
    });
  }
  const words: VerboseTranscript['words'] = [];
  for (const entry of Array.isArray(source.words) ? source.words : []) {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const start = finite(raw.start);
    const end = finite(raw.end);
    if (start === undefined || end === undefined || typeof raw.word !== 'string') continue;
    words.push({ word: raw.word, start, end });
  }
  return { text: typeof source.text === 'string' ? source.text : '', segments, words };
}

/**
 * `seconds` est la durée du WAV mesurée par l'appelant sur le contenu reçu (voir
 * `wavDurationSeconds`) : c'est elle qui est réservée puis réglée, jamais une durée déclarée.
 */
export async function transcribeVerbose(
  config: ASRModelConfig,
  wav: Blob,
  seconds: number,
): Promise<VerboseTranscript> {
  const baseUrl = (config.baseUrl ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('ASR base URL is not configured');

  return runMeteredTenantUsage({
    source: 'asr',
    billableUnit: 'asr_second',
    maxQuantity: seconds,
    providerId: config.providerId,
    modelId: config.modelId || 'default',
    measureActualQuantity: () => seconds,
    execute: async () => {
      const form = new FormData();
      form.set('file', wav, 'audio.wav');
      form.set('model', config.modelId || 'whisper-1');
      form.set('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('timestamp_granularities[]', 'segment');
      form.set('temperature', '0');
      if (config.language && config.language !== 'auto') form.set('language', config.language);

      const response = await (config.fetch ?? fetch)(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        body: form,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`ASR ${response.status}: ${detail.slice(0, ERROR_BODY_LIMIT)}`);
      }
      return parseVerboseTranscript(await response.json().catch(() => null));
    },
  });
}
