import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { SceneOutline } from '@/lib/types/generation';

export type CourseLocale = 'fr-FR' | 'ar-MA' | 'en-US';

export async function persistGeneratedCourse(input: {
  courseId?: string;
  ownerId: string;
  orgId: string;
  stageId: string;
  title: string;
  language: CourseLocale;
  outlines: SceneOutline[];
  sourceManifestId?: string;
}): Promise<string> {
  const supabase = createServiceSupabaseClient();
  const payload = {
    owner_id: input.ownerId,
    org_id: input.orgId,
    stage_id: input.stageId,
    title: input.title,
    language: input.language,
    source_kind: 'generated' as const,
    outline: { scenes: input.outlines },
    source_manifest_id: input.sourceManifestId ?? null,
    status: 'ready' as const,
  };

  if (input.courseId) {
    const { data, error } = await supabase
      .from('courses')
      .update(payload)
      .eq('id', input.courseId)
      .eq('owner_id', input.ownerId)
      .eq('org_id', input.orgId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Failed to update course ${input.courseId}: ${error.message}`);
    if (!data) throw new Error('Course was not found in the current organization');
    return data.id;
  }

  const { data, error } = await supabase.from('courses').insert(payload).select('id').single();
  if (error) throw new Error(`Failed to create generated course: ${error.message}`);
  return data.id;
}
