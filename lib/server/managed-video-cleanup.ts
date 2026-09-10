import { z } from 'zod';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const filePolicies = {
  video: {
    procedure: 'list_orphaned_managed_videos',
    bucket: 'exports',
    pattern: new RegExp(`^generated-video/${uuid}/${uuid}(-${uuid})?[.](mp4|webm)$`),
    label: 'Video',
  },
  import: {
    procedure: 'list_orphaned_course_import_files',
    bucket: 'classroom-media',
    pattern: new RegExp(`^${uuid}/course-imports/${uuid}[.](md|docx|pdf)$`),
    label: 'Import',
  },
} as const;

/** Rescan metadata each cycle so even a late upload after account deletion is found. */
export async function purgeOrphanedManagedVideos(): Promise<number> {
  return purgeOrphanedFiles('video');
}

export async function purgeOrphanedCourseImports(): Promise<number> {
  const files = await purgeOrphanedFiles('import');
  // Records are removed only after Storage metadata proves their object absent.
  const result = await createServiceSupabaseClient()
    .rpc('purge_detached_course_import_records')
    .abortSignal(AbortSignal.timeout(5000));
  if (result.error || !Number.isInteger(result.data) || result.data < 0 || result.data > 100) {
    throw new Error('Import cleanup record removal failed');
  }
  return Math.max(files, result.data);
}

async function purgeOrphanedFiles(kind: keyof typeof filePolicies): Promise<number> {
  const policy = filePolicies[kind];
  const paths = z
    .array(
      z.object({
        object_id: z.string().uuid(),
        object_name: z.string().regex(policy.pattern),
      }),
    )
    .max(100);

  const db = createServiceSupabaseClient(AbortSignal.timeout(15000));
  const candidates = await db.rpc(policy.procedure).abortSignal(AbortSignal.timeout(5000));
  const parsed = paths.safeParse(candidates.data);
  if (candidates.error || !parsed.success)
    throw new Error(`${policy.label} cleanup selection failed`);
  const names = parsed.data.map((item) => item.object_name);
  if (names.length === 0) return 0;
  if (new Set(names).size !== names.length)
    throw new Error(`${policy.label} cleanup selection duplicated`);
  const removed = await db.storage.from(policy.bucket).remove(names);
  if (removed.error) throw new Error(`${policy.label} cleanup storage removal failed`);
  // No local queue is acknowledged: remaining metadata will be selected again after a failure.
  return names.length;
}
