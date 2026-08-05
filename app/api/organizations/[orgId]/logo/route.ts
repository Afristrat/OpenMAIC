import { type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAdmin } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const BUCKET = 'classroom-media';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function storagePath(orgId: string): string {
  return `organization-brand/${orgId}/logo`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath(orgId));
  if (error || !data) return apiError('INVALID_REQUEST', 404, 'Organization logo not found');
  return new Response(data, {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const auth = await requireSuperAdminOrOrgAdmin(request, orgId);
  if (auth.response) return auth.response;
  const formData = await request.formData();
  const file = formData.get('logo');
  if (!(file instanceof File)) return apiError('INVALID_REQUEST', 400, 'Logo file is required');
  if (!ALLOWED_TYPES.has(file.type)) {
    return apiError('INVALID_REQUEST', 400, 'Logo must be a PNG, JPEG or WebP image');
  }
  if (file.size === 0 || file.size > MAX_LOGO_BYTES) {
    return apiError('INVALID_REQUEST', 400, 'Logo must be between 1 byte and 2 MB');
  }
  const supabase = createServiceSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath(orgId), await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) return apiError('INTERNAL_ERROR', 500, uploadError.message);
  const origin = new URL(request.url).origin;
  const logoUrl = `${origin}/api/organizations/${orgId}/logo?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from('organizations')
    .update({ logo: logoUrl })
    .eq('id', orgId);
  if (updateError) return apiError('INTERNAL_ERROR', 500, updateError.message);
  return apiSuccess({ logoUrl });
}
