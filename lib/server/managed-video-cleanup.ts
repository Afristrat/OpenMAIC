import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const paths = z
  .array(
    z.object({
      object_id: z.string().uuid(),
      object_name: z
        .string()
        .regex(new RegExp(`^generated-video/${uuid}/${uuid}(-${uuid})?[.](mp4|webm)$`)),
    }),
  )
  .max(100);

/** Rescan metadata each cycle so even a late upload after account deletion is found. */
export async function purgeOrphanedManagedVideos(): Promise<number> {
  const db = createServiceSupabaseClient();
  const candidates = await db
    .rpc('list_orphaned_managed_videos')
    .abortSignal(AbortSignal.timeout(5000));
  const parsed = paths.safeParse(candidates.data);
  if (candidates.error || !parsed.success) throw new Error('Video cleanup selection failed');
  const names = parsed.data.map((item) => item.object_name);
  if (names.length === 0) return 0;
  if (new Set(names).size !== names.length) throw new Error('Video cleanup selection duplicated');
  const removed = await db.storage.from('exports').remove(names);
  if (removed.error) throw new Error('Video cleanup storage removal failed');
  // No local queue is acknowledged: remaining metadata will be selected again after a failure.
  return names.length;
}
