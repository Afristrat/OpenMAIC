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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  if (!isValidClassroomId(classroomId))
    return apiError('INVALID_REQUEST', 400, 'Classroom invalide');
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');
  const auth = await requireSuperAdminOrOrgEditor(request, ownership.orgId, ownership.ownerId);
  if (auth.response) return auth.response;
  const body = (await request.json()) as { sceneId?: string; actionId?: string; text?: string };
  if (!body.sceneId || !body.actionId || !body.text?.trim()) {
    return apiError('INVALID_REQUEST', 400, 'Scène, prise de parole et texte sont requis');
  }
  const classroom = await readClassroom(classroomId);
  const scene = classroom?.scenes.find((item: { id: string }) => item.id === body.sceneId);
  const actionIndex = scene?.actions?.findIndex((item: Action) => item.id === body.actionId) ?? -1;
  const action = scene?.actions?.[actionIndex];
  if (!classroom || !scene || actionIndex < 0 || action?.type !== 'speech') {
    return apiError('INVALID_REQUEST', 404, 'Prise de parole introuvable');
  }
  const generatedScene = {
    ...scene,
    actions: [{ ...action, text: body.text.trim(), audioId: undefined, audioUrl: undefined }],
  };
  const { data: organization } = await createServiceSupabaseClient()
    .from('organizations')
    .select('settings')
    .eq('id', ownership.orgId)
    .single();
  const teachingProfile =
    classroom.stage.teacherProfile ??
    teachingProfileFromLearningDesign(learningDesignFromSettings(organization?.settings));
  await generateTTSForClassroom(
    [generatedScene],
    classroomId,
    teachingProfile,
    classroom.stage.generatedAgentConfigs ?? [],
  );
  if (!generatedScene.actions?.every((item: Action) => item.type !== 'speech' || item.audioUrl)) {
    return apiError('INTERNAL_ERROR', 502, 'La synthèse vocale a échoué');
  }
  scene.actions = [
    ...(scene.actions ?? []).slice(0, actionIndex),
    ...(generatedScene.actions ?? []),
    ...(scene.actions ?? []).slice(actionIndex + 1),
  ];
  await persistClassroom(
    {
      id: classroomId,
      stage: classroom.stage,
      scenes: classroom.scenes,
      ownerId: ownership.ownerId,
      orgId: ownership.orgId,
    },
    buildRequestOrigin(request),
  );
  return apiSuccess({ actions: scene.actions });
}
