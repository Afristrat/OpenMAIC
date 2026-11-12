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
import { mergeRegeneratedSpeech } from '@/lib/audio/merge-regenerated-speech';
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

/** Réponse du serveur quand le texte enregistré a changé pendant la synthèse : rien n'a été écrit. */
const SPEECH_TEXT_CHANGED_STATUS = 409;

/**
 * Demande la voix d'une ligne. Retourne les actions de la scène telles que le serveur les a
 * enregistrées, ou `null` quand le texte a changé pendant la synthèse (le serveur n'a rien écrit).
 */
async function requestSpeechAudio(
  sceneId: string,
  action: Pick<SpeechAction, 'id' | 'text'>,
  signal?: AbortSignal,
): Promise<Action[] | null> {
  const { useStageStore } = await import('@/lib/store/stage');
  const stageId = useStageStore.getState().stage?.id;
  if (!stageId) {
    throw new Error('La classroom doit être enregistrée avant de régénérer une voix off.');
  }
  const response = await fetch(`/api/classroom/${encodeURIComponent(stageId)}/tts`, {
    method: 'POST',
    // The usage reservation refuses a request without a stable idempotency key.
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ sceneId, actionId: action.id, text: action.text.trim() }),
    signal,
  });
  if (response.status === SPEECH_TEXT_CHANGED_STATUS) return null;
  if (!response.ok) {
    throw new Error('La régénération de la voix off n’a pas pu être enregistrée.');
  }
  const payload = (await response.json()) as { success?: boolean; actions?: Action[] };
  if (!payload.success || !payload.actions) {
    throw new Error('La régénération de la voix off a retourné une réponse invalide.');
  }
  return payload.actions;
}

/** Actions actuelles d'une scène dans le store (relues à chaque appel, jamais une copie ancienne). */
async function currentSceneActions(sceneId: string): Promise<Action[] | null> {
  const { useStageStore } = await import('@/lib/store/stage');
  return useStageStore.getState().scenes.find((scene) => scene.id === sceneId)?.actions ?? null;
}

/**
 * Generate only missing managed-TTS lines, one request at a time.
 * The caller owns the single final scene update: the returned actions are the scene's CURRENT
 * actions (read again after the last synthesis) in which only the voiced lines were replaced, so
 * an edit made meanwhile is kept.
 */
export async function preflightMissingSpeechAudio(
  scene: Scene,
  signal?: AbortSignal,
): Promise<Action[] | null> {
  if (!isManagedTtsActive()) return null;
  const missing = missingSpeechAudioActions(scene);
  if (missing.length === 0) return null;
  // Le serveur n'écrit une voix que si le texte enregistré est celui synthétisé : la copie
  // locale doit donc être enregistrée avant l'envoi.
  if (!(await flushClassroomPersistence())) {
    throw new Error('La classroom doit être enregistrée avant de régénérer une voix off.');
  }

  const voiced: Array<{ id: string; text: string; actions: Action[] }> = [];
  for (const action of missing) {
    const text = action.text.trim();
    const actions = await requestSpeechAudio(scene.id, { id: action.id, text }, signal);
    if (actions) voiced.push({ id: action.id, text, actions });
  }
  if (voiced.length === 0) return null;
  let next = (await currentSceneActions(scene.id)) ?? scene.actions ?? [];
  for (const line of voiced) {
    next = mergeRegeneratedSpeech(next, line.actions, line.id, line.text) ?? next;
  }
  return next;
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
  if (!actions) return null;
  // Relire la scène APRÈS la synthèse : seule la ligne régénérée change, et seulement si
  // l'auteur ne l'a pas réécrite entre-temps. Les autres modifications restent intactes.
  const current = useStageStore.getState().scenes.find((item) => item.id === scene.id);
  const merged = current?.actions
    ? mergeRegeneratedSpeech(current.actions, actions, action.id, text)
    : null;
  if (!merged) return null;
  useStageStore.getState().updateScene(scene.id, { actions: merged });
  return audioId;
}

/**
 * « Générer toutes les voix » d'une scène, une ligne après l'autre. Chaque ligne est relue dans
 * le store au moment de son envoi : une correction faite pendant la synthèse d'une ligne
 * précédente part avec son texte du moment, et une ligne supprimée entre-temps est sautée.
 */
export async function regenerateAllSceneSpeech(
  sceneId: string,
): Promise<{ okIds: string[]; failed: number }> {
  const { useStageStore } = await import('@/lib/store/stage');
  const latest = () => useStageStore.getState().scenes.find((scene) => scene.id === sceneId);
  const ids = (latest()?.actions ?? [])
    .filter((action) => action.type === 'speech' && action.text.trim())
    .map((action) => action.id)
    .filter(Boolean);
  const okIds: string[] = [];
  let failed = 0;
  for (const id of ids) {
    const scene = latest();
    const line = scene?.actions?.find((action) => action.id === id);
    if (!scene || line?.type !== 'speech' || !line.text.trim()) continue;
    try {
      if (await regenerateSpeechAudio(scene.order, { id, text: line.text })) okIds.push(id);
    } catch {
      failed += 1;
    }
  }
  return { okIds, failed };
}
