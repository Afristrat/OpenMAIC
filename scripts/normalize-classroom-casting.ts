import { normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
import { readClassroom } from '@/lib/server/classroom-storage';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

interface StageCastingRow {
  id: string;
  extra: Record<string, unknown> | null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from('stages').select('id, extra').order('created_at');
  if (error) throw new Error(`Impossible de lire les classrooms : ${error.message}`);

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    total: data?.length ?? 0,
    unchanged: 0,
    normalizable: 0,
    skippedWithoutIdentity: [] as string[],
    rejected: [] as Array<{ id: string; reason: string }>,
    updated: [] as string[],
  };

  for (const row of (data ?? []) as StageCastingRow[]) {
    const classroom = await readClassroom(row.id);
    if (!classroom) {
      report.rejected.push({ id: row.id, reason: 'Classroom introuvable après sa lecture.' });
      continue;
    }

    try {
      const casting = normalizeClassroomCasting(classroom.stage, classroom.scenes);
      if (!casting) {
        report.skippedWithoutIdentity.push(row.id);
        continue;
      }
      if (!casting.changed) {
        report.unchanged += 1;
        continue;
      }
      report.normalizable += 1;
      if (!apply) continue;

      const originalScenes = new Map(classroom.scenes.map((scene) => [scene.id, scene]));
      for (const scene of casting.scenes) {
        const original = originalScenes.get(scene.id);
        if (JSON.stringify(original?.actions ?? null) === JSON.stringify(scene.actions ?? null)) {
          continue;
        }
        const { error: sceneError } = await supabase
          .from('scenes')
          .update({ actions: scene.actions ?? null })
          .eq('id', scene.id)
          .eq('stage_id', row.id);
        if (sceneError) {
          throw new Error(`Échec de mise à jour de la scène ${scene.id} : ${sceneError.message}`);
        }
      }

      const { error: stageError } = await supabase
        .from('stages')
        .update({
          extra: {
            ...(row.extra ?? {}),
            teacherProfile: casting.teacherProfile,
            generatedAgentConfigs: casting.agents,
          },
        })
        .eq('id', row.id);
      if (stageError) {
        throw new Error(`Échec de mise à jour du casting : ${stageError.message}`);
      }
      report.updated.push(row.id);
    } catch (caught) {
      report.rejected.push({
        id: row.id,
        reason: caught instanceof Error ? caught.message : 'Erreur inconnue.',
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));

  if (report.rejected.length > 0) process.exitCode = 1;
}

void main();
