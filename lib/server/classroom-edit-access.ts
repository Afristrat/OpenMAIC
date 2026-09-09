import type { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { readClassroomOwnership } from '@/lib/server/classroom-storage';

/** Bind a long-running edit to the same resource, tenant and authenticated actor. */
export async function assertClassroomEditAccess(
  request: NextRequest,
  classroomId: string,
  expected: { orgId: string; ownerId: string | null },
  actorId: string,
): Promise<void> {
  const current = await readClassroomOwnership(classroomId);
  if (!current || current.orgId !== expected.orgId || current.ownerId !== expected.ownerId) {
    throw new Error('Classroom edit access unavailable');
  }
  const auth = await requireSuperAdminOrOrgEditor(request, current.orgId, current.ownerId);
  if (auth.response || auth.user.id !== actorId) {
    throw new Error('Classroom edit access unavailable');
  }
}
