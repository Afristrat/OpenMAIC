import { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ stageId: string; sceneId: string }> },
) {
  const { stageId, sceneId } = await params;
  if (!isValidClassroomId(stageId) || !isValidClassroomId(sceneId)) {
    return apiError('INVALID_REQUEST', 400, 'Identifiant de capture invalide');
  }
  const ownership = await readClassroomOwnership(stageId);
  if (!ownership) return apiError('INVALID_REQUEST', 404, 'Classroom introuvable');
  const auth = await requireSuperAdminOrOrgMember(request, ownership.orgId);
  if (auth.response) return auth.response;
  if (request.headers.get('content-type') !== 'image/png') {
    return apiError('INVALID_REQUEST', 415, 'Une image PNG est requise');
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SNAPSHOT_BYTES) {
    return apiError('INVALID_REQUEST', 413, 'Capture vide ou trop volumineuse');
  }
  const path = `${stageId}/export/${sceneId}.png`;
  const { error } = await createServiceSupabaseClient()
    .storage.from('classroom-media')
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (error)
    return apiError('INTERNAL_ERROR', 500, `Échec du stockage de la capture : ${error.message}`);
  return apiSuccess({ path });
}
