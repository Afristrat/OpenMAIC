/**
 * Per-speech managed-TTS helpers for the timeline editor.
 *
 * Audio is keyed and produced exactly like the generation pipeline: the cache
 * key is `tts_s<sceneOrder>_<actionId>` (see use-scene-generator /
 * classroom-media-generation) and synthesis delegates to `generateAndStoreTTS`,
 * so the request/store contract and key scheme stay single-sourced.
 */
import { db } from '@/lib/utils/database';
import { useSettingsStore } from '@/lib/store/settings';
import { isTTSProviderEnabled } from '@/lib/audio/provider-enablement';
import { flushClassroomPersistence } from '@/lib/edit/classroom-persistence';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

/** Canonical audio cache key — matches the generation pipeline. */
export function speechAudioId(sceneOrder: number, actionId: string): string {
  return `tts_s${sceneOrder}_${actionId}`;
}

/**
 * The audio key for a speech action: its stamped `audioId` (set by the pipeline
 * or a prior regen) if present, else the canonical derived key. Single source
 * of truth for "what blob belongs to this speech line".
 */
export function resolveSpeechAudioId(
  sceneOrder: number,
  action: { id?: string; audioId?: string },
): string {
  return action.audioId || speechAudioId(sceneOrder, action.id ?? '');
}

/** Managed (server) TTS is on — browser-native TTS has no cached file to manage. */
export function isManagedTtsActive(): boolean {
  const s = useSettingsStore.getState();
  return (
    s.ttsEnabled &&
    s.ttsProviderId !== 'browser-native-tts' &&
    isTTSProviderEnabled(s.ttsProviderId, s.ttsProvidersConfig?.[s.ttsProviderId])
  );
}

/** Non-empty speech lines that managed playback cannot currently play. */
export function missingSpeechAudioActions(scene: Scene): SpeechAction[] {
  return (scene.actions ?? []).filter(
    (action): action is SpeechAction =>
      action.type === 'speech' && !!action.text.trim() && !action.audioId && !action.audioUrl,
  );
}

async function requestSpeechAudio(
  sceneId: string,
  action: Pick<SpeechAction, 'id' | 'text'>,
  signal?: AbortSignal,
): Promise<Action[]> {
  const { useStageStore } = await import('@/lib/store/stage');
  const stageId = useStageStore.getState().stage?.id;
  if (!stageId) {
    throw new Error('La classroom doit être enregistrée avant de régénérer une voix off.');
  }
  const response = await fetch(`/api/classroom/${encodeURIComponent(stageId)}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneId, actionId: action.id, text: action.text.trim() }),
    signal,
  });
  if (!response.ok) {
    throw new Error('La régénération de la voix off n’a pas pu être enregistrée.');
  }
  const payload = (await response.json()) as { success?: boolean; actions?: Action[] };
  if (!payload.success || !payload.actions) {
    throw new Error('La régénération de la voix off a retourné une réponse invalide.');
  }
  return payload.actions;
}

/**
 * Generate only missing managed-TTS lines, one request at a time.
 * The caller owns the single final scene update.
 */
export async function preflightMissingSpeechAudio(
  scene: Scene,
  signal?: AbortSignal,
): Promise<Action[] | null> {
  if (!isManagedTtsActive()) return null;
  const missing = missingSpeechAudioActions(scene);
  if (missing.length === 0) return null;

  let actions: Action[] | null = null;
  for (const action of missing) {
    actions = await requestSpeechAudio(scene.id, action, signal);
  }
  return actions;
}

/** True if an audio blob is cached under this exact audioId. */
export async function audioExists(audioId: string): Promise<boolean> {
  return !!(await db.audioFiles.get(audioId));
}

/** Existence for many audioIds in one IndexedDB round-trip. */
export async function audioExistsBulk(audioIds: string[]): Promise<Set<string>> {
  if (audioIds.length === 0) return new Set();
  const recs = await db.audioFiles.bulkGet(audioIds);
  const have = new Set<string>();
  recs.forEach((r, i) => {
    if (r) have.add(audioIds[i]);
  });
  return have;
}

/** Object URL for the audio cached under this exact audioId (caller revokes). */
export async function audioObjectUrl(audioId: string): Promise<string | null> {
  const rec = await db.audioFiles.get(audioId);
  return rec ? URL.createObjectURL(rec.blob) : null;
}

/**
 * Discard the cached audio for a speech line (both its stamped audioId, if any,
 * and the canonical derived key). Called when the user edits a line's text: the
 * cache key is derived from sceneOrder+actionId (not the text), so without this
 * the stale blob would keep replaying for the new wording. After this the line
 * reads as "not voiced" and must be regenerated.
 */
export async function discardSpeechAudio(
  sceneOrder: number,
  action: { id?: string; audioId?: string },
): Promise<void> {
  if (!action.id) return;
  const ids = new Set([speechAudioId(sceneOrder, action.id)]);
  if (action.audioId) ids.add(action.audioId);
  await db.audioFiles.bulkDelete([...ids]);
}

/**
 * (Re)generate TTS for one persisted speech line.
 *
 * The classroom API synthesizes the audio, stores it in the durable classroom
 * bucket, and persists the amended action. A browser cache fallback would make
 * a corrected narration disappear on another device or after a redeploy, so it
 * is deliberately forbidden here.
 */
export async function regenerateSpeechAudio(
  sceneOrder: number,
  action: { id?: string; text?: string },
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isManagedTtsActive()) return null;
  const text = action.text?.trim();
  if (!text || !action.id) return null;
  const audioId = speechAudioId(sceneOrder, action.id);
  const { useStageStore } = await import('@/lib/store/stage');
  const state = useStageStore.getState();
  const scene = state.scenes.find(
    (item) => item.order === sceneOrder && item.actions?.some((item) => item.id === action.id),
  );
  if (!state.stage?.id || !scene) {
    throw new Error('La classroom doit être enregistrée avant de régénérer une voix off.');
  }
  if (!(await flushClassroomPersistence())) {
    throw new Error('La classroom doit être enregistrée avant de régénérer une voix off.');
  }
  const actions = await requestSpeechAudio(scene.id, { id: action.id, text }, signal);
  useStageStore.getState().updateScene(scene.id, { actions });
  return audioId;
}
