import { NextRequest } from 'next/server';
import { assertClassroomEditAccess } from '@/lib/server/classroom-edit-access';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { insufficientCreditsResponse } from '@/lib/server/credit-error-response';
import { generateTTSForClassroom } from '@/lib/server/classroom-media-generation';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
  readClassroomOwnership,
} from '@/lib/server/classroom-storage';
import { ClassroomCastingError, normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
import { mergeRegeneratedSpeech } from '@/lib/audio/merge-regenerated-speech';
import type { Action } from '@/lib/types/action';
import { runWithUsageMeteringContext, withStableIdempotencyKey } from '@/lib/billing/usage-context';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  if (!isValidClassroomId(classroomId))
    return apiError('INVALID_REQUEST', 400, 'Classroom invalide');
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');
  const auth = await requireSuperAdminOrOrgEditor(
    request,
    ownership.orgId,
    ownership.ownerId,
    classroomId,
  );
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
  const text = body.text.trim();
  const generatedScene = {
    ...scene,
    actions: [{ ...action, text, audioId: undefined, audioUrl: undefined }],
  };
  const report = await runWithUsageMeteringContext(
    withStableIdempotencyKey(request.headers),
    auth.user.id,
    ownership.orgId,
    () =>
      generateTTSForClassroom(
        [generatedScene],
        classroomId,
        () => assertClassroomEditAccess(request, classroomId, ownership, auth.user.id),
        casting.teacherProfile,
        casting.agents,
        undefined,
        casting.stage.languageDirective,
      ),
  );
  if (report.creditsBlocked) return insufficientCreditsResponse();
  if (!generatedScene.actions?.every((item: Action) => item.type !== 'speech' || item.audioUrl)) {
    return apiError('INTERNAL_ERROR', 502, 'La synthèse vocale a échoué');
  }
  await assertClassroomEditAccess(request, classroomId, ownership, auth.user.id);
  // La synthèse dure plusieurs secondes : un enregistrement de l'éditeur a pu arriver pendant ce
  // temps. On relit donc la formation et on n'y insère que la ligne synthétisée, à condition que
  // son texte enregistré soit encore celui qui a été lu. Sinon la voix ne lui correspond plus.
  const fresh = await readClassroom(classroomId);
  if (!fresh) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');
  let freshCasting;
  try {
    freshCasting = normalizeClassroomCasting(fresh.stage, fresh.scenes);
  } catch (error) {
    const message =
      error instanceof ClassroomCastingError ? error.message : 'Le casting vocal est invalide.';
    return apiError('INVALID_REQUEST', 422, message);
  }
  if (!freshCasting) {
    return apiError('INVALID_REQUEST', 422, 'Cette classroom ne possède aucun casting vocal.');
  }
  const freshScene = freshCasting.scenes.find((item: { id: string }) => item.id === body.sceneId);
  const merged = freshScene?.actions
    ? mergeRegeneratedSpeech(freshScene.actions, generatedScene.actions ?? [], action.id, text)
    : null;
  if (!freshScene || !merged) {
    return apiError(
      'SPEECH_TEXT_CHANGED',
      409,
      'Le texte de cette prise de parole a changé pendant la synthèse : la voix n’a pas été enregistrée.',
    );
  }
  freshScene.actions = merged;
  await persistClassroom(
    {
      id: classroomId,
      stage: freshCasting.stage,
      scenes: freshCasting.scenes,
      ownerId: ownership.ownerId,
      orgId: ownership.orgId,
    },
    buildRequestOrigin(request),
  );
  return apiSuccess({ actions: merged });
}
