import { NextRequest, type NextResponse } from 'next/server';
import { requireSuperAdminOrOrgSharer } from '@/lib/api/auth';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import {
  grantStageByEmail,
  listStageGrants,
  normalizeShareEmail,
  revokeStageGrant,
} from '@/lib/server/stage-grants';

const log = createLogger('ClassroomGrants');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SharerContext =
  | { response: NextResponse; userId?: never }
  | { response?: never; userId: string };

async function resolveSharer(request: NextRequest, classroomId: string): Promise<SharerContext> {
  if (!isValidClassroomId(classroomId)) {
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Classroom invalide') };
  }
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) {
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom introuvable') };
  }
  const auth = await requireSuperAdminOrOrgSharer(request, ownership.orgId, ownership.ownerId);
  if (auth.response) return { response: auth.response };
  return { userId: auth.user.id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveSharer(request, classroomId);
    if (context.response) return context.response;
    return apiSuccess({ grants: await listStageGrants(classroomId) });
  } catch (error) {
    log.error('Failed to list classroom grants', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de lecture des partages');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveSharer(request, classroomId);
    if (context.response) return context.response;
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = normalizeShareEmail(body?.email);
    if (!email) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Adresse e-mail invalide');
    }
    const result = await grantStageByEmail({
      stageId: classroomId,
      email,
      grantedBy: context.userId,
    });
    if (result.status === 'no_account') {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        404,
        'Aucun compte Qalem pour cette adresse',
        'NO_ACCOUNT',
      );
    }
    return apiSuccess({ status: result.status });
  } catch (error) {
    log.error('Failed to grant classroom', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec du partage');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveSharer(request, classroomId);
    if (context.response) return context.response;
    const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
    if (typeof body?.userId !== 'string' || !UUID_PATTERN.test(body.userId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Personne invalide');
    }
    await revokeStageGrant(classroomId, body.userId);
    return apiSuccess({ revoked: true });
  } catch (error) {
    log.error('Failed to revoke classroom grant', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec du retrait du partage');
  }
}
