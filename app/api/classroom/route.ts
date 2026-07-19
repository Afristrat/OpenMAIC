import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  listClassrooms,
  renameClassroom,
  deleteClassroom,
  readClassroom,
  readClassroomOwnership,
  isClassroomPublic,
} from '@/lib/server/classroom-storage';
import { requireSuperAdminOrOrgAdmin, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { classroomPersistSchema } from '@/lib/api/schemas';
import { createLogger } from '@/lib/logger';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('Classroom API');

export async function POST(request: NextRequest) {
  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const rawBody = await request.json();
    const validation = validateBody(classroomPersistSchema, rawBody);
    if (!validation.success) return validation.response;

    const { orgId, stage, scenes } = validation.data;
    stageId = typeof stage.id === 'string' ? stage.id : undefined;
    sceneCount = scenes.length;

    const auth = await requireSuperAdminOrOrgAdmin(request, orgId);
    if (auth.response) return auth.response;

    const id = stageId || randomUUID();
    const baseUrl = buildRequestOrigin(request);

    // classroomPersistSchema only validates "some record" shape for stage/scenes
    // (the full @openmaic/dsl contract isn't re-validated here) — same
    // permissiveness the untyped pre-migration body had, now made explicit.
    const persisted = await persistClassroom(
      {
        id,
        stage: { ...stage, id } as unknown as Stage,
        scenes: scenes as unknown as Scene[],
        ownerId: auth.user.id,
        orgId,
      },
      baseUrl,
    );

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    log.error(
      `Classroom storage failed [stageId=${stageId ?? 'unknown'}, scenes=${sceneCount ?? 0}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function requireClassroomAdmin(request: NextRequest, id: string) {
  const ownership = await readClassroomOwnership(id);
  if (!ownership) return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found') };
  const auth = await requireSuperAdminOrOrgAdmin(request, ownership.orgId);
  return auth.response ? { error: auth.response } : {};
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !isValidClassroomId(id)) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    const gate = await requireClassroomAdmin(request, id);
    if (gate.error) return gate.error;
    const body = (await request.json()) as { name?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'A classroom name is required');
    }
    const name = body.name.trim();
    await renameClassroom(id, name);
    return apiSuccess({ id, name });
  } catch (error) {
    log.error('Classroom rename failed:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to rename classroom', error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !isValidClassroomId(id)) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    const gate = await requireClassroomAdmin(request, id);
    if (gate.error) return gate.error;
    await deleteClassroom(id);
    return apiSuccess({ id });
  } catch (error) {
    log.error('Classroom deletion failed:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete classroom', error instanceof Error ? error.message : String(error));
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      const orgId = request.nextUrl.searchParams.get('orgId');
      if (!orgId) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required parameter: id or orgId');
      const auth = await requireSuperAdminOrOrgMember(request, orgId);
      if (auth.response) return auth.response;
      return apiSuccess({ classrooms: await listClassrooms(orgId) });
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const ownership = await readClassroomOwnership(id);
    if (!ownership) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    if (!(await isClassroomPublic(id))) {
      const auth = await requireSuperAdminOrOrgMember(request, ownership.orgId);
      if (auth.response) return auth.response;
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    // ownerId/orgId are internal authorization state — never exposed to the client.
    const { ownerId: _ownerId, orgId: _orgId, ...publicClassroom } = classroom;

    return apiSuccess({ classroom: publicClassroom });
  } catch (error) {
    log.error(
      `Classroom retrieval failed [id=${request.nextUrl.searchParams.get('id') ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
