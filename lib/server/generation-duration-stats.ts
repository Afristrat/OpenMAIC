import {
  summarizeTypicalDuration,
  type TrackedKind,
  type TypicalDuration,
} from '@/lib/generation/generation-tracking';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const SAMPLE_LIMIT = 15;
const SCAN_LIMIT = 80;

interface JobPayload {
  kind?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

function durationOf(kind: TrackedKind, payload: JobPayload): number | undefined {
  const isPlan = payload.kind === 'classroom-plan';
  if ((kind === 'plan') !== isPlan) return undefined;
  const start = Date.parse((kind === 'plan' ? payload.createdAt : payload.startedAt) ?? '');
  const end = Date.parse((kind === 'plan' ? payload.updatedAt : payload.completedAt) ?? '');
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : undefined;
}

/**
 * What a successful run usually takes, measured on this platform's recent jobs
 * (never a guessed figure). Undefined until enough runs have succeeded.
 */
export async function getTypicalDuration(kind: TrackedKind): Promise<TypicalDuration | undefined> {
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from('classroom_generation_jobs')
      .select('payload')
      .eq('status', 'succeeded')
      .order('updated_at', { ascending: false })
      .limit(SCAN_LIMIT);
    if (error || !data) return undefined;
    const durations = data
      .map((row) => durationOf(kind, row.payload as JobPayload))
      .filter((value): value is number => value !== undefined)
      .slice(0, SAMPLE_LIMIT);
    return summarizeTypicalDuration(durations);
  } catch {
    return undefined;
  }
}
