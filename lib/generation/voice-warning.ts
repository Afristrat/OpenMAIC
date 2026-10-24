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
