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
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { Scene, Stage } from '@/lib/types/stage';
import { presentationBrandingFromOrganization } from '@/lib/branding/presentation-branding';

const log = createLogger('Classroom API');

export async function POST(request: NextRequest) {
  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const rawBody = await request.json().catch(() => null);
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

export async function PUT(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const stageId = typeof rawBody?.stage?.id === 'string' ? rawBody.stage.id : '';
    if (!stageId || !isValidClassroomId(stageId) || !Array.isArray(rawBody?.scenes)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Classroom invalide');
    }
    const ownership = await readClassroomOwnership(stageId);
    if (!ownership) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom introuvable');
    const auth = await requireSuperAdminOrOrgAdmin(request, ownership.orgId);
    if (auth.response) return auth.response;
    await persistClassroom(
      {
        id: stageId,
        stage: rawBody.stage as Stage,
        scenes: rawBody.scenes as Scene[],
        ownerId: ownership.ownerId,
        orgId: ownership.orgId,
      },
      buildRequestOrigin(request),
    );
    const submittedIds = (rawBody.scenes as Scene[]).map((scene) => scene.id);
    const supabase = createServiceSupabaseClient();
    const { data: existingScenes, error: readError } = await supabase
      .from('scenes')
      .select('id')
      .eq('stage_id', stageId);
    if (readError) throw new Error(`Failed to reconcile classroom scenes: ${readError.message}`);
    const staleIds = (existingScenes ?? [])
      .map((scene) => scene.id)
      .filter((id) => !submittedIds.includes(id));
    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from('scenes').delete().in('id', staleIds);
      if (deleteError)
        throw new Error(`Failed to delete removed classroom scenes: ${deleteError.message}`);
    }
    return apiSuccess({ id: stageId });
  } catch (error) {
    log.error('Classroom update failed:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de la sauvegarde de la classroom');
  }
}

async function requireClassroomAdmin(request: NextRequest, id: string) {
  const ownership = await readClassroomOwnership(id);
  if (!ownership)
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found') };
  const auth = await requireSuperAdminOrOrgAdmin(request, ownership.orgId);
  return auth.response ? { error: auth.response } : {};
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !isValidClassroomId(id))
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    const gate = await requireClassroomAdmin(request, id);
    if (gate.error) return gate.error;
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    if (typeof body?.name !== 'string' || !body.name.trim()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'A classroom name is required');
    }
    const name = body.name.trim();
    await renameClassroom(id, name);
    return apiSuccess({ id, name });
  } catch (error) {
    log.error('Classroom rename failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to rename classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !isValidClassroomId(id))
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    const gate = await requireClassroomAdmin(request, id);
    if (gate.error) return gate.error;
    await deleteClassroom(id);
    return apiSuccess({ id });
  } catch (error) {
    log.error('Classroom deletion failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      const orgId = request.nextUrl.searchParams.get('orgId');
      if (!orgId)
        return apiError(
          API_ERROR_CODES.MISSING_REQUIRED_FIELD,
          400,
          'Missing required parameter: id or orgId',
        );
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

    const { data: organization, error: organizationError } = await createServiceSupabaseClient()
      .from('organizations')
      .select('logo, settings')
      .eq('id', ownership.orgId)
      .maybeSingle();
    if (organizationError) {
      throw new Error(`Failed to read organization presentation branding: ${organizationError.message}`);
    }

    // ownerId/orgId are internal authorization state — never exposed to the client.
    const { ownerId: _ownerId, orgId: _orgId, ...publicClassroom } = classroom;
    return apiSuccess({
      classroom: {
        ...publicClassroom,
        stage: {
          ...publicClassroom.stage,
          presentationBranding: presentationBrandingFromOrganization(
            organization?.logo,
            organization?.settings as Record<string, unknown> | undefined,
          ),
        },
      },
    });
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
