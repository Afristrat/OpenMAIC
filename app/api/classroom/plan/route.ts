import { type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  apiError,
  apiSuccess,
  API_ERROR_CODES,
  publicErrorMessage,
} from '@/lib/server/api-response';
import {
  isClassroomPublic,
  isValidClassroomId,
  readClassroomOwnership,
} from '@/lib/server/classroom-storage';
import { requireSuperAdminOrOrgEditor, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { approvedClassroomPlanSchema } from '@/lib/api/schemas';
import { hasClassroomShareAccess } from '@/lib/server/classroom-share-access';
import { readClassroomPlan, saveClassroomPlan } from '@/lib/server/classroom-plan';
import { createLogger } from '@/lib/logger';
import type { ClassroomPlan } from '@/lib/types/generation';

const log = createLogger('Classroom plan API');

/** Lecture : mêmes droits que la salle de cours (membre, partage entre organisations ou salle publique). */
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id') ?? '';
    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }
    const ownership = await readClassroomOwnership(id);
    if (!ownership) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');

    const orgId = request.nextUrl.searchParams.get('orgId') || ownership.orgId;
    const member = await requireSuperAdminOrOrgMember(request, orgId);
    if (
      orgId !== ownership.orgId &&
      !member.response &&
      !(await hasClassroomShareAccess(id, orgId))
    ) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Classroom sharing denied');
    }
    if (member.response && !(await isClassroomPublic(id))) return member.response;

    const record = await readClassroomPlan(id);
    if (!record?.plan) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Plan unavailable');
    }
    const editor = await requireSuperAdminOrOrgEditor(
      request,
      ownership.orgId,
      ownership.ownerId,
      id,
    );
    return apiSuccess({
      courseId: record.courseId,
      language: record.language,
      plan: record.plan,
      canEdit: !editor.response,
    });
  } catch (error) {
    log.error('Plan read failed', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to read the plan',
      publicErrorMessage(error, 'Failed to read the plan'),
    );
  }
}

const savePlanSchema = z.object({ id: z.string().min(1), plan: approvedClassroomPlanSchema });

/** Écriture : réservée à ceux qui peuvent modifier la salle de cours. */
export async function PUT(request: NextRequest) {
  try {
    const parsed = savePlanSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isValidClassroomId(parsed.data.id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid plan');
    }
    const { id, plan } = parsed.data;
    const ownership = await readClassroomOwnership(id);
    if (!ownership) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    const editor = await requireSuperAdminOrOrgEditor(
      request,
      ownership.orgId,
      ownership.ownerId,
      id,
    );
    if (editor.response) return editor.response;
    await saveClassroomPlan(id, plan as unknown as ClassroomPlan);
    return apiSuccess({ saved: true });
  } catch (error) {
    log.error('Plan save failed', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to save the plan',
      publicErrorMessage(error, 'Failed to save the plan'),
    );
  }
}
