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
import { ClassroomCastingError, normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
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
  if (!classroom) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');
  let casting;
  try {
    casting = normalizeClassroomCasting(classroom.stage, classroom.scenes);
  } catch (error) {
    const message =
      error instanceof ClassroomCastingError ? error.message : 'Le casting vocal est invalide.';
    return apiError('INVALID_REQUEST', 422, message);
  }
  if (!casting) {
    return apiError('INVALID_REQUEST', 422, 'Cette classroom ne possède aucun casting vocal.');
  }
  const scene = casting.scenes.find((item: { id: string }) => item.id === body.sceneId);
  const actionIndex = scene?.actions?.findIndex((item: Action) => item.id === body.actionId) ?? -1;
  const action = scene?.actions?.[actionIndex];
  if (!scene || actionIndex < 0 || action?.type !== 'speech') {
    return apiError('INVALID_REQUEST', 404, 'Prise de parole introuvable');
  }
  const generatedScene = {
    ...scene,
    actions: [{ ...action, text: body.text.trim(), audioId: undefined, audioUrl: undefined }],
  };
  await generateTTSForClassroom(
    [generatedScene],
    classroomId,
    casting.teacherProfile,
    casting.agents,
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
      stage: casting.stage,
      scenes: casting.scenes,
      ownerId: ownership.ownerId,
      orgId: ownership.orgId,
    },
    buildRequestOrigin(request),
  );
  return apiSuccess({ actions: scene.actions });
}
