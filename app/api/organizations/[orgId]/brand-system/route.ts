import { type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAdmin } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { extractOrganizationDesignSystem } from '@/lib/server/organization-brand-extractor';

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const auth = await requireSuperAdminOrOrgAdmin(request, orgId);
  if (auth.response) return auth.response;
  try {
    const body = (await request.json()) as { websiteUrl?: string };
    if (!body.websiteUrl?.trim()) {
      return apiError('INVALID_REQUEST', 400, 'websiteUrl is required');
    }
    const designSystem = await extractOrganizationDesignSystem(body.websiteUrl.trim());
    const supabase = createServiceSupabaseClient();
    const { data: organization, error: readError } = await supabase
      .from('organizations')
      .select('settings, logo')
      .eq('id', orgId)
      .single();
    if (readError || !organization) {
      return apiError('INVALID_REQUEST', 404, 'Organization not found');
    }
    const settings = {
      ...((organization.settings as Record<string, unknown> | null) ?? {}),
      brandDesignSystem: designSystem,
    };
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        settings,
        ...(organization.logo || !designSystem.logoUrl ? {} : { logo: designSystem.logoUrl }),
      })
      .eq('id', orgId);
    if (updateError) return apiError('INTERNAL_ERROR', 500, updateError.message);
    return apiSuccess({ designSystem, logoUrl: organization.logo || designSystem.logoUrl || null });
  } catch (error) {
    return apiError(
      'UPSTREAM_ERROR',
      502,
      error instanceof Error ? error.message : 'Brand extraction failed',
    );
  }
}
