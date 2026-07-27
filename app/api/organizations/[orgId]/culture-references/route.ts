import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { CULTURE_REFERENCE_VERSION, getCultureReference } from '@/lib/agents/culture-references';
import { learningDesignFromSettings } from '@/lib/agents/persona-catalog';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  culture: z.enum(['ma-fr', 'ma-ar', 'en']),
  version: z.literal(CULTURE_REFERENCE_VERSION),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const { orgId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();
  if (membership?.role !== 'admin') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Admin access required');
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid cultural reference');

  const { data: organization, error: readError } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single();
  if (readError || !organization)
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 404, 'Organization not found');

  const learningDesign = learningDesignFromSettings(organization.settings);
  learningDesign.cultureReferenceApprovals[parsed.data.culture] = {
    version: parsed.data.version,
    approvedAt: new Date().toISOString(),
    approvedBy: user.id,
  };
  const settings = {
    ...(organization.settings ?? {}),
    learningDesign,
  };
  const { error: updateError } = await supabase
    .from('organizations')
    .update({ settings })
    .eq('id', orgId);
  if (updateError) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to approve cultural reference');
  }

  const reference = getCultureReference(parsed.data.culture);
  return apiSuccess({
    culture: reference.code,
    version: CULTURE_REFERENCE_VERSION,
    approval: learningDesign.cultureReferenceApprovals[parsed.data.culture],
  });
}
