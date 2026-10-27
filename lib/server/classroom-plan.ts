import { approvedClassroomPlanSchema } from '@/lib/api/schemas';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { ClassroomPlan } from '@/lib/types/generation';

export interface ClassroomPlanRecord {
  courseId: string;
  title: string;
  language: 'fr-FR' | 'ar-MA' | 'en-US';
  plan: ClassroomPlan | null;
}

/** Programme (syllabus et plan des scènes) enregistré avec la formation générée dans cette salle de cours. */
export async function readClassroomPlan(stageId: string): Promise<ClassroomPlanRecord | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('courses')
    .select('id, title, language, outline')
    .eq('stage_id', stageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the plan of classroom ${stageId}: ${error.message}`);
  if (!data) return null;
  const parsed = approvedClassroomPlanSchema.safeParse(
    (data.outline as Record<string, unknown> | null)?.plan,
  );
  return {
    courseId: data.id,
    title: data.title,
    language: data.language,
    // Le schéma de validation est un sous-ensemble de ClassroomPlan : ses champs libres sont conservés tels quels.
    plan: parsed.success ? (parsed.data as unknown as ClassroomPlan) : null,
  };
}

/** Remplace le programme enregistré (plan, entrées de scènes et titre) sans toucher aux autres clés du cours. */
export async function saveClassroomPlan(stageId: string, plan: ClassroomPlan): Promise<void> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('courses')
    .select('id, outline')
    .eq('stage_id', stageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the course of classroom ${stageId}: ${error.message}`);
  if (!data) throw new Error(`No course linked to classroom ${stageId}`);
  const outline = { ...(data.outline as Record<string, unknown>), scenes: plan.outlines, plan };
  const { error: updateError } = await db
    .from('courses')
    .update({ title: plan.courseTitle, outline })
    .eq('id', data.id);
  if (updateError) throw new Error(`Failed to save the plan: ${updateError.message}`);
}
