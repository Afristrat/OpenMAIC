/**
 * Client-safe vocabulary shared by the plan and course generation trackers:
 * ordered steps, readable failures, server liveness and duration formatting.
 * No server imports: it is used by API routes and by React components alike.
 */

export const PLAN_STEPS = [
  'reading_sources',
  'checking_sources',
  'designing_plan',
  'finalizing',
] as const;
export type PlanStep = (typeof PLAN_STEPS)[number] | 'correcting_plan';

export const COURSE_STEPS = [
  'initializing',
  'researching',
  'generating_outlines',
  'generating_scenes',
  'generating_media',
  'generating_tts',
  'persisting',
] as const;
export type CourseStep = (typeof COURSE_STEPS)[number];

export type TrackedKind = 'plan' | 'course';

/** A repeated design pass is shown on the design step, not as an extra one. */
export function planStepPosition(step: string | undefined): number {
  const normalized = step === 'correcting_plan' ? 'designing_plan' : step;
  const index = PLAN_STEPS.findIndex((candidate) => candidate === normalized);
  return index < 0 ? 0 : index;
}

export function courseStepPosition(step: string | undefined): number {
  const index = COURSE_STEPS.findIndex((candidate) => candidate === step);
  return index < 0 ? 0 : index;
}

export type GenerationFailureCode =
  | 'SCENE_COUNT_MISMATCH'
  | 'INSUFFICIENT_CREDITS'
  | 'PROVIDER_QUOTA'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE';

export interface GenerationFailure {
  code: GenerationFailureCode;
  params: Record<string, string | number>;
}

/**
 * Turns an internal error string into a code the interface can explain in the
 * author's language. Unknown errors return undefined and keep their raw text.
 */
export function describeGenerationFailure(raw: string | undefined): GenerationFailure | undefined {
  if (!raw) return undefined;
  const mismatch = /^SCENE_COUNT_MISMATCH:\s*requested\s+(\d+),\s*received\s+(\d+)/i.exec(raw);
  if (mismatch) {
    return {
      code: 'SCENE_COUNT_MISMATCH',
      params: { requested: Number(mismatch[1]), received: Number(mismatch[2]) },
    };
  }
  if (/INSUFFICIENT_(TENANT_)?CREDITS/.test(raw))
    return { code: 'INSUFFICIENT_CREDITS', params: {} };
  if (/\b429\b|budget|quota|rate.?limit/i.test(raw)) return { code: 'PROVIDER_QUOTA', params: {} };
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(raw)) {
    return { code: 'PROVIDER_AUTH', params: {} };
  }
  if (/timeout|timed out|abort/i.test(raw)) return { code: 'PROVIDER_TIMEOUT', params: {} };
  if (/fetch failed|ECONNREFUSED|ECONNRESET|UND_ERR|\b50[0-4]\b|Internal Server Error/i.test(raw)) {
    return { code: 'PROVIDER_UNAVAILABLE', params: {} };
  }
  return undefined;
}

export type Liveness = 'active' | 'slow' | 'stalled';

export const LIVENESS_SLOW_MS = 120_000;
export const LIVENESS_STALLED_MS = 300_000;

/** How long the server has been silent: its worker beats at least every minute. */
export function getLiveness(silentMs: number): Liveness {
  if (silentMs >= LIVENESS_STALLED_MS) return 'stalled';
  if (silentMs >= LIVENESS_SLOW_MS) return 'slow';
  return 'active';
}

export interface TypicalDuration {
  lowMs: number;
  highMs: number;
  sampleSize: number;
}

/** Interquartile range of past successful durations; undefined below three samples. */
export function summarizeTypicalDuration(durationsMs: number[]): TypicalDuration | undefined {
  const sorted = durationsMs.filter((value) => Number.isFinite(value) && value > 0).sort(byValue);
  if (sorted.length < 3) return undefined;
  const at = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(ratio * sorted.length))];
  return { lowMs: at(0.25), highMs: at(0.75), sampleSize: sorted.length };
}

function byValue(a: number, b: number): number {
  return a - b;
}

export interface DurationLabels {
  seconds: (count: number) => string;
  minutes: (count: number) => string;
}

export function formatDuration(ms: number, labels: DurationLabels): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 90) return labels.seconds(seconds);
  return labels.minutes(Math.round(seconds / 60));
}

/** The later of two ISO timestamps: the worker heartbeat lives in a column, not in the payload. */
export function laterTimestamp(first: string, second: string | undefined): string {
  if (!second) return first;
  return Date.parse(second) > Date.parse(first) ? second : first;
}
