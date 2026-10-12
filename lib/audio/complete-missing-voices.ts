import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import { isSilentSpeech } from './speech-audio-report';

export interface MissingVoicesProgress {
  done: number;
  total: number;
}

export interface MissingVoicesResult {
  requested: number;
  generated: number;
  /** Lines still silent after the attempt. */
  failed: number;
  updatedScenes: Array<{ id: string; actions: Action[] }>;
}

interface MissingVoicesPayload {
  success?: boolean;
  error?: string;
  requested?: number;
  generated?: number;
  failed?: unknown[];
  updatedScenes?: Array<{ id: string; actions: Action[] }>;
}

/**
 * Generates the voices a saved course is missing, one scene per request: a whole course would
 * outlast a single HTTP request. The caller applies `updatedScenes` to its store.
 */
export async function completeMissingVoices(
  stageId: string,
  scenes: readonly Scene[],
  onProgress?: (progress: MissingVoicesProgress) => void,
): Promise<MissingVoicesResult> {
  const pending = scenes.filter((scene) => (scene.actions ?? []).some(isSilentSpeech));
  const total = pending.reduce(
    (count, scene) => count + (scene.actions ?? []).filter(isSilentSpeech).length,
    0,
  );
  const result: MissingVoicesResult = { requested: 0, generated: 0, failed: 0, updatedScenes: [] };
  onProgress?.({ done: 0, total });

  for (const scene of pending) {
    const response = await fetch(`/api/classroom/${encodeURIComponent(stageId)}/tts/missing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ sceneId: scene.id }),
    });
    const payload = (await response.json().catch(() => ({}))) as MissingVoicesPayload;
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'La génération des voix manquantes a échoué.');
    }
    result.requested += payload.requested ?? 0;
    result.generated += payload.generated ?? 0;
    result.failed += payload.failed?.length ?? 0;
    result.updatedScenes.push(...(payload.updatedScenes ?? []));
    onProgress?.({ done: result.generated + result.failed, total });
  }
  return result;
}
