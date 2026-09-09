import { z } from 'zod';
import { approvedClassroomPlanSchema } from '@/lib/api/schemas';
import { importCanvasToClassroomPlan } from '@/lib/courses/import-canvas-to-plan';
import { parseImportCanvas } from '@/lib/courses/import-canvas-validator';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { loadOwnedCourseForGeneration } from './course-generation-access';

/** Caller must first load the course through loadOwnedCourseForGeneration. Read-only, no AI. */
export async function recoverImportedCoursePlan(
  course: Awaited<ReturnType<typeof loadOwnedCourseForGeneration>>,
  orgId: string,
  ownerId: string,
) {
  if (
    Object.hasOwn(course.outline, 'plan') ||
    course.status !== 'draft' ||
    course.source_kind !== 'imported' ||
    !course.import_id ||
    !course.source_manifest_id
  )
    return null;
  const db = createServiceSupabaseClient();
  const imported = await db
    .from('course_imports')
    .select('original_filename')
    .eq('id', course.import_id)
    .eq('owner_id', ownerId)
    .eq('validation_status', 'conform')
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (imported.error) throw new Error('Import lookup unavailable');
  if (!imported.data) return null;
  const manifest = await db
    .from('formation_source_manifests')
    .select('source_ids, diwan_references')
    .eq('id', course.source_manifest_id)
    .eq('org_id', orgId)
    .eq('owner_id', ownerId)
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (manifest.error) throw new Error('Manifest lookup unavailable');
  const selection = z
    .object({
      source_ids: z.array(z.string().uuid()).length(1),
      diwan_references: z.array(z.unknown()).length(0),
    })
    .safeParse(manifest.data);
  if (!selection.success) return null;
  const source = await db
    .from('organization_sources')
    .select('text_content')
    .eq('id', selection.data.source_ids[0])
    .eq('org_id', orgId)
    .eq('status', 'ready')
    .eq('name', imported.data.original_filename)
    .abortSignal(AbortSignal.timeout(5000))
    .maybeSingle();
  if (source.error) throw new Error('Source lookup unavailable');
  if (
    !source.data ||
    typeof source.data.text_content !== 'string' ||
    !parseImportCanvas(source.data.text_content)
  )
    return null;
  const rebuilt = importCanvasToClassroomPlan(source.data.text_content, course.language);
  // Preserve the stored title and edited scenes; only recover the missing syllabus/directive.
  const validated = approvedClassroomPlanSchema.safeParse({
    ...rebuilt,
    courseTitle: course.title,
    outlines: course.outline.scenes,
  });
  return validated.success ? validated.data : null;
}
