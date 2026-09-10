import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const replayCursor = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(
    (value) =>
      /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'),
  );
const pageSchema = z.object({
  events: z
    .array(
      z.object({
        id: replayCursor,
        ts_ms: z.number().int().nonnegative(),
        actor: z.enum(['user', 'agent', 'system']),
        event_type: z.string(),
        payload: z.record(z.string(), z.unknown()),
        audio_path: z.string().nullable(),
        audio_bytes: z.number().int().nonnegative(),
      }),
    )
    .max(100),
  nextCursor: replayCursor.nullable(),
  upperBound: replayCursor,
});

export async function readSessionReplayPage(
  db: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string,
  signal: AbortSignal,
  after = '0',
  upper: string | null = null,
) {
  const result = await db
    .rpc('read_session_replay_page', {
      p_session: id,
      p_after: after,
      p_upper: upper,
    })
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
  if (result.error) throw new Error('Replay page unavailable');
  if (result.data === null) return null;
  const page = pageSchema.parse(result.data);
  let previous = BigInt(after);
  if (upper !== null && page.upperBound !== upper) throw new Error('Replay ceiling changed');
  for (const event of page.events) {
    if (BigInt(event.id) <= previous || BigInt(event.id) > BigInt(page.upperBound))
      throw new Error('Replay order invalid');
    previous = BigInt(event.id);
  }
  if (
    page.nextCursor !== null &&
    (page.events.length !== 100 || page.nextCursor !== page.events.at(-1)?.id)
  )
    throw new Error('Replay cursor invalid');
  return page;
}
