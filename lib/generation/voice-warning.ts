import { summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import type { ClassroomGenerationWarnings } from '@/lib/server/tts-outcome';

export interface VoiceWarning {
  missing: number;
  total: number;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Reads the voice warning of a finished generation job. The payload crosses the network, so
 * it is validated: anything that is not a positive number of silent lines yields no warning.
 */
export function readVoiceWarning(warnings: unknown): VoiceWarning | null {
  if (typeof warnings !== 'object' || warnings === null) return null;
  const { ttsMissing, ttsRequested } = warnings as Partial<
    Record<keyof ClassroomGenerationWarnings, unknown>
  >;
  if (!isCount(ttsMissing) || !isCount(ttsRequested) || ttsMissing === 0) return null;
  return { missing: Math.min(ttsMissing, ttsRequested), total: ttsRequested };
}

/**
 * A succeeded course opens at once, except when part of its voices is missing: the author
 * must read that message before landing in the course.
 */
export function shouldAutoOpenCourse(job: {
  status: string;
  result?: { url: string };
  warnings?: unknown;
}): boolean {
  return job.status === 'succeeded' && Boolean(job.result?.url) && !readVoiceWarning(job.warnings);
}

/**
 * The voice state of a kept course as it is now. The `warnings` of a job are a snapshot taken at
 * the end of the generation and never recomputed, so the status screen reads the saved course.
 */
export type LiveVoiceState =
  | { kind: 'pending' }
  | { kind: 'unknown' }
  | { kind: 'voiced' }
  | { kind: 'missing'; missing: number; total: number };

/** Counts the silent speech lines of the saved course; any failure to read it is `unknown`. */
export async function readLiveVoiceState(
  classroomId: string,
  signal?: AbortSignal,
): Promise<LiveVoiceState> {
  try {
    const response = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`, {
      signal,
    });
    const data: unknown = await response.json();
    const scenes = (data as { classroom?: { scenes?: unknown } } | null)?.classroom?.scenes;
    if (!response.ok || !Array.isArray(scenes)) return { kind: 'unknown' };
    const { missing, speech } = summarizeSpeechAudio(scenes);
    return missing === 0 ? { kind: 'voiced' } : { kind: 'missing', missing, total: speech };
  } catch {
    return { kind: 'unknown' };
  }
}
