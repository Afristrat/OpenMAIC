import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { SceneOutline } from '@/lib/types/generation';

export type CourseLocale = 'fr-FR' | 'ar-MA' | 'en-US';

export async function persistImportedCourseDraft(input: {
  ownerId: string;
  orgId: string;
  importId: string;
  sourceManifestId: string;
  title: string;
  language: CourseLocale;
  outlines: SceneOutline[];
}): Promise<string> {
  const { data, error } = await createServiceSupabaseClient()
    .from('courses')
    .insert({
      owner_id: input.ownerId,
      org_id: input.orgId,
      import_id: input.importId,
      source_manifest_id: input.sourceManifestId,
      title: input.title,
      language: input.language,
      source_kind: 'imported',
      outline: { scenes: input.outlines },
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create imported course: ${error.message}`);
  return data.id;
}

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
  const readyPayload = {
    owner_id: input.ownerId,
    org_id: input.orgId,
    stage_id: input.stageId,
    title: input.title,
    language: input.language,
    outline: { scenes: input.outlines },
    source_manifest_id: input.sourceManifestId ?? null,
    status: 'ready' as const,
  };

  if (input.courseId) {
    const { data, error } = await supabase
      .from('courses')
      .update(readyPayload)
      .eq('id', input.courseId)
      .eq('owner_id', input.ownerId)
      .eq('org_id', input.orgId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Failed to update course ${input.courseId}: ${error.message}`);
    if (!data) throw new Error('Course was not found in the current organization');
    return data.id;
  }

  const { data, error } = await supabase
    .from('courses')
    .insert({ ...readyPayload, source_kind: 'generated' })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create generated course: ${error.message}`);
  return data.id;
}
