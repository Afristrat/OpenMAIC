import { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { generateTTSForClassroom } from '@/lib/server/classroom-media-generation';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
  readClassroomOwnership,
} from '@/lib/server/classroom-storage';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { learningDesignFromSettings } from '@/lib/agents/persona-catalog';
import { teachingProfileFromLearningDesign } from '@/lib/org/teaching-profile';
import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

function countSpeechAudio(scenes: Scene[]): number {
  return scenes.reduce(
    (count, scene) =>
      count +
      (scene.actions ?? []).filter(
        (action: Action) => action.type === 'speech' && Boolean(action.audioUrl),
      ).length,
    0,
  );
}

/** Regenerates the managed voiceover for the complete, persisted classroom. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  if (!isValidClassroomId(classroomId)) {
    return apiError('INVALID_REQUEST', 400, 'Classroom invalide');
  }

  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');
  const auth = await requireSuperAdminOrOrgEditor(request, ownership.orgId, ownership.ownerId);
  if (auth.response) return auth.response;

  const classroom = await readClassroom(classroomId);
  if (!classroom) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');

  const body = (await request.json().catch(() => null)) as { sceneId?: string } | null;
  const selectedScenes = body?.sceneId
    ? classroom.scenes.filter((scene) => scene.id === body.sceneId)
    : classroom.scenes;
  if (body?.sceneId && selectedScenes.length === 0) {
    return apiError('INVALID_REQUEST', 404, 'Scène introuvable');
  }

  const speechCount = selectedScenes.reduce(
    (count, scene) =>
      count + (scene.actions ?? []).filter((action: Action) => action.type === 'speech').length,
    0,
  );
  if (speechCount === 0) {
    return apiError('INVALID_REQUEST', 422, 'Cette classroom ne contient aucune prise de parole');
  }

  const { data: organization } = await createServiceSupabaseClient()
    .from('organizations')
    .select('settings')
    .eq('id', ownership.orgId)
    .single();
  const teachingProfile =
    classroom.stage.teacherProfile ??
    teachingProfileFromLearningDesign(learningDesignFromSettings(organization?.settings));

  const regeneratedScenes = structuredClone(selectedScenes);
  await generateTTSForClassroom(
    regeneratedScenes,
    classroomId,
    teachingProfile,
    classroom.stage.generatedAgentConfigs ?? [],
  );
  const generatedAudioCount = countSpeechAudio(regeneratedScenes);
  if (generatedAudioCount === 0) {
    return apiError('GENERATION_FAILED', 502, 'Aucune piste audio n’a pu être générée');
  }

  await persistClassroom(
    {
      id: classroomId,
      stage: classroom.stage,
      scenes: classroom.scenes.map(
        (scene) => regeneratedScenes.find((regenerated) => regenerated.id === scene.id) ?? scene,
      ),
      ownerId: ownership.ownerId,
      orgId: ownership.orgId,
    },
    buildRequestOrigin(request),
  );

  return apiSuccess({ speechCount, generatedAudioCount });
}
