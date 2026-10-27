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
  jobId?: string;
  status?: 'running' | 'succeeded' | 'failed';
  requested?: number;
  generated?: number;
  failed?: unknown[];
  updatedScenes?: Array<{ id: string; actions: Action[] }>;
}

const POLL_INTERVAL_MS = 3_000;
/** Consecutive failed polls before giving up: a network blip must not abandon a running job. */
const MAX_POLL_FAILURES = 5;
export const VOICE_COMPLETION_FAILED_CODE = 'VOICE_COMPLETION_FAILED';
const FAILURE_MESSAGE = VOICE_COMPLETION_FAILED_CODE;

/** Clé i18n du message à montrer pour le code d'erreur d'un job de voix (inconnu : message générique). */
export function voiceCompletionErrorKey(code: string): string {
  switch (code) {
    case 'INSUFFICIENT_CREDITS':
      return 'billing.credits.consumptionBlocked';
    case 'NO_CASTING':
      return 'edit.tts.noCasting';
    case 'INVALID_CASTING':
      return 'edit.tts.invalidCasting';
    case 'NOT_FOUND':
      return 'edit.tts.notFound';
    default:
      return 'edit.tts.completionFailed';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function readPayload(response: Response): Promise<MissingVoicesPayload> {
  return (await response.json().catch(() => ({}))) as MissingVoicesPayload;
}

/**
 * Generates the voices a saved course is missing, one scene at a time. A scene takes minutes, far
 * longer than a request survives at the edge (≈ 125 s), so the server runs it as a job and this
 * function follows it by polling. The caller applies `updatedScenes` to its store.
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

  const base = `/api/classroom/${encodeURIComponent(stageId)}/tts/missing`;
  let doneBefore = 0;
  for (const scene of pending) {
    const started = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ sceneId: scene.id }),
    });
    const startPayload = await readPayload(started);
    if (!started.ok || !startPayload.success || !startPayload.jobId) {
      throw new Error(startPayload.error || FAILURE_MESSAGE);
    }
    let payload: MissingVoicesPayload = {};
    for (let failures = 0; ; ) {
      await sleep(POLL_INTERVAL_MS);
      let polled: Response | null = null;
      try {
        polled = await fetch(`${base}/${encodeURIComponent(startPayload.jobId)}`);
      } catch {
        polled = null;
      }
      payload = polled ? await readPayload(polled) : {};
      if (!polled?.ok || !payload.success) {
        failures += 1;
        // A job the server no longer knows (restart) will not come back: stop at once.
        if (polled?.status === 404 || failures >= MAX_POLL_FAILURES) {
          throw new Error(payload.error || FAILURE_MESSAGE);
        }
        continue;
      }
      failures = 0;
      onProgress?.({
        done: doneBefore + (payload.generated ?? 0) + (payload.failed?.length ?? 0),
        total,
      });
      if (payload.status !== 'running') break;
    }
    if (payload.status === 'failed') throw new Error(payload.error || FAILURE_MESSAGE);
    result.requested += payload.requested ?? 0;
    result.generated += payload.generated ?? 0;
    result.failed += payload.failed?.length ?? 0;
    result.updatedScenes.push(...(payload.updatedScenes ?? []));
    doneBefore = result.generated + result.failed;
    onProgress?.({ done: doneBefore, total });
  }
  return result;
}
