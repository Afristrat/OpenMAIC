import { type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { LOGO_MAX_BYTES, isAcceptedLogoType } from '@/lib/branding/logo-formats';
import { prepareLogoUpload } from '@/lib/branding/logo-upload';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import { buildRequestOrigin } from '@/lib/server/request-origin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const BUCKET = 'classroom-media';
// Served types are raster only: an SVG upload is converted to PNG by
// prepareLogoUpload, because an SVG served from our origin could carry script.
const SERVED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type Params = { params: Promise<{ classroomId: string }> };

function storagePath(classroomId: string): string {
  return `classroom-brand/${classroomId}/logo`;
}

/**
 * Resolves the classroom and proves the caller may edit it, with the same rule
 * as the classroom editor itself (author, delegated editor, manager, admin).
 */
async function requireClassroomEditor(request: NextRequest, classroomId: string) {
  if (!isValidClassroomId(classroomId)) {
    return { response: apiError('INVALID_REQUEST', 400, 'Invalid classroom id') };
  }
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) return { response: apiError('INVALID_REQUEST', 404, 'Classroom not found') };
  const auth = await requireSuperAdminOrOrgEditor(
    request,
    ownership.orgId,
    ownership.ownerId,
    classroomId,
  );
  return auth.response ? { response: auth.response } : {};
}

/**
 * Public like the organisation logo: the mark is shown on shared and published
 * classrooms, whose viewers may be anonymous. The URL carries a version so a
 * replaced logo is fetched again despite caching.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { classroomId } = await params;
  if (!isValidClassroomId(classroomId)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
  }
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath(classroomId));
  if (error || !data) return apiError('INVALID_REQUEST', 404, 'Classroom logo not found');
  return new Response(data, {
    headers: {
      'Content-Type': SERVED_TYPES.has(data.type) ? data.type : 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { classroomId } = await params;
  const gate = await requireClassroomEditor(request, classroomId);
  if (gate.response) return gate.response;
  const formData = await request.formData();
  const file = formData.get('logo');
  if (!(file instanceof File)) return apiError('INVALID_REQUEST', 400, 'Logo file is required');
  if (!isAcceptedLogoType(file.type)) {
    return apiError('INVALID_REQUEST', 400, 'Logo must be a PNG, JPEG, WebP or SVG image');
  }
  if (file.size === 0 || file.size > LOGO_MAX_BYTES) {
    return apiError('INVALID_REQUEST', 400, 'Logo must be between 1 byte and 2 MB');
  }
  const prepared = await prepareLogoUpload(file);
  if (!prepared) return apiError('INVALID_REQUEST', 400, 'Logo image could not be read');
  const supabase = createServiceSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath(classroomId), prepared.bytes, {
      contentType: prepared.contentType,
      upsert: true,
    });
  if (uploadError) return apiError('INTERNAL_ERROR', 500, 'Logo upload failed');
  const logoUrl = `${buildRequestOrigin(request)}/api/classroom/${classroomId}/logo?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from('stages')
    .update({ logo: logoUrl })
    .eq('id', classroomId);
  if (updateError) return apiError('INTERNAL_ERROR', 500, 'Logo could not be saved');
  return apiSuccess({ logoUrl });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { classroomId } = await params;
  const gate = await requireClassroomEditor(request, classroomId);
  if (gate.response) return gate.response;
  const supabase = createServiceSupabaseClient();
  const { error: updateError } = await supabase
    .from('stages')
    .update({ logo: null })
    .eq('id', classroomId);
  if (updateError) return apiError('INTERNAL_ERROR', 500, 'Logo could not be removed');
  // The stage no longer points at the file; a failed removal only leaves an
  // unreferenced object, never a visible logo.
  await supabase.storage.from(BUCKET).remove([storagePath(classroomId)]);
  return apiSuccess({ logoUrl: null });
}
