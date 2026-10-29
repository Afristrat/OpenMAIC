/**
 * Choix du fournisseur de voix off de l'extension : toujours côté serveur, jamais côté client.
 *
 * Premier fournisseur géré par la plateforme connu du catalogue de synthèse vocale.
 */

import { DEFAULT_TTS_MODELS, DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { getServerTTSProviders } from '@/lib/server/provider-config';

export type CaptureSpeechProvider = {
  providerId: TTSProviderId;
  voice: string;
  modelId: string;
};

export function pickCaptureSpeechProvider(
  servers: Record<string, { disabled?: boolean }> = getServerTTSProviders(),
): CaptureSpeechProvider | null {
  const id = Object.entries(servers)
    .filter(
      ([providerId, info]) =>
        providerId !== 'browser-native-tts' &&
        Object.hasOwn(TTS_PROVIDERS, providerId) &&
        !info.disabled,
    )
    .map(([providerId]) => providerId)[0];
  if (!id) return null;
  return {
    providerId: id as TTSProviderId,
    voice: DEFAULT_TTS_VOICES[id as keyof typeof DEFAULT_TTS_VOICES] ?? 'default',
    modelId: DEFAULT_TTS_MODELS[id as keyof typeof DEFAULT_TTS_MODELS] ?? '',
  };
}
