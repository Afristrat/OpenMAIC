import { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAdmin } from '@/lib/api/auth';
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
import type { Scene } from '@/lib/types/stage';

function countSpeechAudio(scenes: Scene[]): number {
  return scenes.reduce(
    (count, scene) =>
      count +
      (scene.actions ?? []).filter(
        (action) => action.type === 'speech' && Boolean(action.audioUrl),
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
  const auth = await requireSuperAdminOrOrgAdmin(request, ownership.orgId);
  if (auth.response) return auth.response;

  const classroom = await readClassroom(classroomId);
  if (!classroom) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');

  const speechCount = classroom.scenes.reduce(
    (count, scene) => count + (scene.actions ?? []).filter((action) => action.type === 'speech').length,
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
  const teachingProfile = teachingProfileFromLearningDesign(
    learningDesignFromSettings(organization?.settings),
  );

  const regeneratedScenes = structuredClone(classroom.scenes);
  await generateTTSForClassroom(regeneratedScenes, classroomId, teachingProfile);
  const generatedAudioCount = countSpeechAudio(regeneratedScenes);
  if (generatedAudioCount === 0) {
    return apiError('GENERATION_FAILED', 502, 'Aucune piste audio n’a pu être générée');
  }

  await persistClassroom(
    {
      id: classroomId,
      stage: classroom.stage,
      scenes: regeneratedScenes,
      ownerId: ownership.ownerId,
      orgId: ownership.orgId,
    },
    buildRequestOrigin(request),
  );

  return apiSuccess({ speechCount, generatedAudioCount });
}
