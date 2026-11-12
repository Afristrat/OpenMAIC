import { type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAdmin } from '@/lib/api/auth';
import { LOGO_MAX_BYTES, isAcceptedLogoType } from '@/lib/branding/logo-formats';
import { prepareLogoUpload } from '@/lib/branding/logo-upload';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { buildRequestOrigin } from '@/lib/server/request-origin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const BUCKET = 'classroom-media';

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
  if (!isAcceptedLogoType(file.type)) {
    return apiError('INVALID_REQUEST', 400, 'Logo must be a PNG, JPEG, WebP or SVG image');
  }
  if (file.size === 0 || file.size > LOGO_MAX_BYTES) {
    return apiError('INVALID_REQUEST', 400, 'Logo must be between 1 byte and 2 MB');
  }
  // An SVG is stored as a high-definition PNG: see prepareLogoUpload.
  const prepared = await prepareLogoUpload(file);
  if (!prepared) return apiError('INVALID_REQUEST', 400, 'Logo image could not be read');
  const supabase = createServiceSupabaseClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath(orgId), prepared.bytes, {
      contentType: prepared.contentType,
      upsert: true,
    });
  if (uploadError) return apiError('INTERNAL_ERROR', 500, uploadError.message);
  const origin = buildRequestOrigin(request);
  const logoUrl = `${origin}/api/organizations/${orgId}/logo?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from('organizations')
    .update({ logo: logoUrl })
    .eq('id', orgId);
  if (updateError) return apiError('INTERNAL_ERROR', 500, updateError.message);
  return apiSuccess({ logoUrl });
}
